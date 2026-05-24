import { notFound } from 'next/navigation'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getProject } from '@/lib/queries/projects'
import { listProducts } from '@/lib/queries/products'
import { listExpenses, listReturns } from '@/lib/queries/expenses'
import {
  funnelSemanticTotals,
  getCustomDrivers,
  getFunnels,
  getOrCreateTracker,
  nowYearMonth,
} from '@/lib/queries/tracker'
import { computeUnits, currentMonthRange } from '@/lib/units'
import { cn } from '@/lib/utils'

function fmt(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })
}

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  const { year, month } = nowYearMonth()
  const tracker = await getOrCreateTracker(id, year, month)
  const [funnels, products, expenses, returns, customDrivers] = await Promise.all([
    getFunnels(tracker.id),
    listProducts(id),
    listExpenses(id),
    listReturns(id),
    getCustomDrivers(tracker.id),
  ])

  const monthRange = currentMonthRange(year, month)
  const inMonth = (d: string) => {
    const dt = new Date(d + 'T00:00:00Z')
    return dt >= monthRange.from && dt <= monthRange.to
  }

  // Семантические аггрегаты по всем воронкам
  let revenue = 0
  let salesCount = 0
  let applications = 0
  for (const f of funnels) {
    const t = funnelSemanticTotals(f, inMonth)
    revenue += t.revenue
    salesCount += t.sales
    applications += t.applications
  }
  const avgCheck = salesCount > 0 ? revenue / salesCount : 0

  const units = computeUnits({
    project: { work_model: project.work_model, fix_amount: project.fix_amount },
    products,
    funnels: funnels.map((f) => ({
      id: f.id,
      product_id: f.product_id,
      is_mini_product: f.is_mini_product,
      metrics: f.metrics,
      log: f.log,
    })),
    expenses,
    returns,
    from: monthRange.from,
    to: monthRange.to,
  })

  const planAvg = Number(tracker.revenue_plan_avg)
  const planMin = Number(tracker.revenue_plan_min)
  const planMax = Number(tracker.revenue_plan_max)
  const pct = planAvg > 0 ? Math.min(100, Math.round((revenue / planAvg) * 100)) : 0

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Цілі місяця</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3 text-center">
            <PlanBox label="Мінімум" value={planMin} />
            <PlanBox label="Середній" value={planAvg} highlight />
            <PlanBox label="Максимум" value={planMax} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Факт місяця: {fmt(revenue)}</span>
              <span>{pct}% від середнього</span>
            </div>
            <ProgressBar pct={pct} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Декомпозиція цілі</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DriverBox label="Виручка, $" plan={planAvg} actual={revenue} />
          <DriverBox label="Продажі" plan={Number(tracker.sales_plan)} actual={salesCount} />
          <DriverBox label="Середній чек, $" plan={Number(tracker.avg_check_plan)} actual={avgCheck} />
          <DriverBox label="Анкети" plan={Number(tracker.applications_plan)} actual={applications} />
        </CardContent>
        {customDrivers.length > 0 ? (
          <CardContent className="grid gap-3 border-t pt-4 sm:grid-cols-2 lg:grid-cols-4">
            {customDrivers.map((cd) => (
              <DriverBox key={cd.id} label={cd.name + (cd.unit ? `, ${cd.unit}` : '')} plan={Number(cd.plan_value)} actual={Number(cd.actual_value)} />
            ))}
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Юніти місяця</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <BigNum label="Виручка проєкту" value={units.gross_revenue} />
          <BigNum label="Дохід центру" value={units.center_income} />
          <BigNum label="Чистий прибуток центру" value={units.net_profit} />
        </CardContent>
      </Card>
    </div>
  )
}

function PlanBox({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={cn('rounded-md border p-3', highlight && 'border-foreground/30 bg-muted/30')}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold">{fmt(value)}</div>
    </div>
  )
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-2 overflow-hidden rounded bg-muted">
      <div className={cn('h-full', pct >= 100 ? 'bg-emerald-500' : 'bg-foreground/70')} style={{ width: `${pct}%` }} />
    </div>
  )
}

function DriverBox({ label, plan, actual }: { label: string; plan: number; actual: number }) {
  const pct = plan > 0 ? Math.round((actual / plan) * 100) : 0
  return (
    <div className="rounded-md border bg-card/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">
        <span className="font-semibold">{fmt(actual)}</span>
        <span className="text-muted-foreground"> / {fmt(plan)}</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded bg-muted">
        <div className={cn('h-full', pct >= 100 ? 'bg-emerald-500' : 'bg-foreground/70')} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground">{pct}%</div>
    </div>
  )
}

function BigNum({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-card/40 p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{fmt(value)}</div>
    </div>
  )
}
