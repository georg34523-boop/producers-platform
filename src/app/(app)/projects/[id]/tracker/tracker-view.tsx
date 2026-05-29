'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { computeDerivedMetrics, computeStageConversions } from '@/lib/funnel-derived'
import {
  FUNNEL_DEFAULTS,
  FUNNEL_TYPE_HINT,
  FUNNEL_TYPE_LABEL,
  type FunnelType,
  getStageTemplate,
  STAGE_GROUP_LABEL,
  STAGE_LIBRARY,
  type StageGroup,
  type StageTemplate,
  TRAFFIC_CHANNELS,
  TRAFFIC_FIELDS,
  metricKeyFor,
  stageFlowPriority,
} from '@/lib/funnel-library'
import { LAUNCH_STATUS_LABEL, MONTH_LABEL_RU } from '@/lib/labels'
import type {
  Funnel,
  FunnelDailyLog,
  FunnelMetric,
  FunnelMiniPrice,
  FunnelProductSale,
  FunnelReactivation,
  LaunchStatus,
  MonthlyTracker,
  Product,
  TrackerWeeklyPlan,
} from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

import {
  addMiniPrice,
  addStageFromTemplate,
  addTrafficField,
  createFunnel,
  deleteFunnel,
  deleteLogRow,
  deleteMetric,
  deleteMiniPrice,
  deleteProductSale,
  deleteReactivation,
  deleteStage,
  setFunnelProducts,
  setWeeklyPlan,
  updateFunnel,
  updateMetric,
  updateTrackerField,
  upsertDailyLog,
  upsertProductSale,
  upsertReactivation,
} from './actions'

type FullFunnel = Funnel & {
  mini_prices: FunnelMiniPrice[]
  metrics: FunnelMetric[]
  log: FunnelDailyLog[]
  product_ids: string[]
  product_sales: FunnelProductSale[]
  reactivations_out: FunnelReactivation[]
  reactivations_in: FunnelReactivation[]
}

// Утилиты ----------------------------------------------------
function fmt(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })
}
function pad(n: number): string {
  return String(n).padStart(2, '0')
}
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
function dayIso(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`
}
function weeksOfMonth(y: number, m: number) {
  // Календарні тижні Пн–Нд: кожен тиждень завершується у неділю (або останній день місяця).
  const total = daysInMonth(y, m)
  const weeks: { idx: number; start: number; end: number }[] = []
  let idx = 1
  let weekStart = 1
  for (let day = 1; day <= total; day++) {
    const dow = new Date(Date.UTC(y, m - 1, day)).getUTCDay() // 0 = Sunday
    if (dow === 0 || day === total) {
      weeks.push({ idx, start: weekStart, end: day })
      idx++
      weekStart = day + 1
    }
  }
  // Більше 6 тижнів в одному місяці не буває — обмежимо для бази (week_index ≤ 6)
  return weeks.slice(0, 6)
}
function dayOfWeek(date: string): string {
  return ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][new Date(date + 'T00:00:00Z').getUTCDay()]!
}
function sumMetric(log: FunnelDailyLog[], key: string): number {
  let s = 0
  for (const r of log) {
    const v = r.values?.[key]
    if (typeof v === 'number' && Number.isFinite(v)) s += v
  }
  return s
}
/** Метрики, які зливаються в application.main з upstream етапів (вебінар/автовебінар). */
function upstreamApplicationsFor(m: FunnelMetric, allMetrics: FunnelMetric[]): FunnelMetric[] {
  if (m.key !== 'application__main') return []
  return allMetrics.filter(
    (x) =>
      x.role === 'applications' &&
      (x.stage_group?.startsWith('webinar') || x.stage_group?.startsWith('autowebinar')),
  )
}

/** Auto-розрахункова метрика: computed_from, application.main з upstream, CR сайту. */
function isAutoMetric(m: FunnelMetric, allMetrics?: FunnelMetric[]): boolean {
  if (m.computed_from && m.computed_from.length > 0) return true
  if (m.key.endsWith('__landing_cr')) return true
  if (m.key === 'application__main' && allMetrics && upstreamApplicationsFor(m, allMetrics).length > 0) return true
  return false
}
function metricFact(m: FunnelMetric, log: FunnelDailyLog[], allMetrics?: FunnelMetric[]): number {
  // Рекурсивне розгортання computed_from (компоненти теж можуть бути авто)
  if (m.computed_from && m.computed_from.length > 0) {
    let s = 0
    for (const k of m.computed_from) {
      const child = allMetrics?.find((x) => x.key === k)
      s += child ? metricFact(child, log, allMetrics) : sumMetric(log, k)
    }
    return s
  }
  // application.main = ручний ввід + сума upstream applications (вебінар/автовебінар)
  if (m.key === 'application__main' && allMetrics) {
    const upstream = upstreamApplicationsFor(m, allMetrics)
    if (upstream.length > 0) {
      const auto = upstream.reduce((s, x) => s + sumMetric(log, x.key), 0)
      return sumMetric(log, m.key) + auto
    }
  }
  if (m.key.endsWith('__landing_cr') && allMetrics) {
    const apps = allMetrics.find((x) => x.role === 'applications')
    const clicksM = allMetrics.find((x) => x.key === 'traffic__clicks')
    if (!apps || !clicksM) return 0
    const a = apps.computed_from?.length
      ? apps.computed_from.reduce((s, k) => s + sumMetric(log, k), 0)
      : sumMetric(log, apps.key)
    const c = sumMetric(log, clicksM.key)
    return c > 0 ? (a / c) * 100 : 0
  }
  return sumMetric(log, m.key)
}

function groupedByStage(metrics: FunnelMetric[]) {
  // Возвращает массив { stage_group, label, metrics[] }
  // Порядок: traffic → entry → warmup → qualification → payment → special
  const groups = new Map<string, FunnelMetric[]>()
  for (const m of [...metrics].sort((a, b) => a.position - b.position)) {
    const sg = m.stage_group ?? 'other'
    if (!groups.has(sg)) groups.set(sg, [])
    groups.get(sg)!.push(m)
  }
  const sgs = [...groups.keys()].sort((a, b) => {
    const pa = stageFlowPriority(a)
    const pb = stageFlowPriority(b)
    if (pa !== pb) return pa - pb
    // якщо однакові — за position першої метрики
    return (groups.get(a)![0]?.position ?? 0) - (groups.get(b)![0]?.position ?? 0)
  })
  return sgs.map((sg) => {
    const base = sg.replace(/_(\d+)$/, '')
    const variant = sg.match(/_(\d+)$/)?.[1]
    const tpl = getStageTemplate(base)
    let label = tpl ? (variant ? `${tpl.label} #${variant}` : tpl.label) : sg
    if (sg === 'traffic') label = 'Трафік'
    return { stage_group: sg, label, metrics: groups.get(sg)! }
  })
}

// Орхестратор ------------------------------------------------
export function TrackerView({
  projectId,
  tracker,
  funnels,
  weeklyPlans,
  products,
}: {
  projectId: string
  tracker: MonthlyTracker
  funnels: FullFunnel[]
  weeklyPlans: TrackerWeeklyPlan[]
  products: Product[]
}) {
  return (
    <div className="space-y-6">
      <MonthSwitcher projectId={projectId} tracker={tracker} />
      <BlockA projectId={projectId} tracker={tracker} weeklyPlans={weeklyPlans} funnels={funnels} />
      <FunnelsSection projectId={projectId} tracker={tracker} funnels={funnels} products={products} />
      <ReflectionDialog projectId={projectId} tracker={tracker} />
    </div>
  )
}

function ReflectionDialog({ projectId, tracker }: { projectId: string; tracker: MonthlyTracker }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="flex justify-end">
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Рефлексія місяця
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Якість роботи з експертом — {MONTH_LABEL_RU[tracker.month]} {tracker.year}</DialogTitle>
          </DialogHeader>
          <BlockD projectId={projectId} tracker={tracker} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MonthSwitcher({ projectId, tracker }: { projectId: string; tracker: MonthlyTracker }) {
  const prev = new Date(Date.UTC(tracker.year, tracker.month - 2, 1))
  const next = new Date(Date.UTC(tracker.year, tracker.month, 1))
  const ym = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/projects/${projectId}/tracker?ym=${ym(prev)}`} />}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">
          {MONTH_LABEL_RU[tracker.month]} {tracker.year}
        </h2>
        <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link href={`/projects/${projectId}/tracker?ym=${ym(next)}`} />}>
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Badge variant={tracker.status === 'closed' ? 'secondary' : 'default'}>
          {tracker.status === 'closed' ? 'Закрыт' : 'Открыт'}
        </Badge>
      </div>
    </div>
  )
}

// Блок A: цели + cash flow ----------------------------------
function BlockA({
  projectId,
  tracker,
  weeklyPlans,
  funnels,
}: {
  projectId: string
  tracker: MonthlyTracker
  weeklyPlans: TrackerWeeklyPlan[]
  funnels: FullFunnel[]
}) {
  const weeks = weeksOfMonth(tracker.year, tracker.month)
  const planByWeek = new Map(weeklyPlans.map((p) => [p.week_index, Number(p.revenue_plan)]))

  // Считаем выручку по дням из всех revenue-метрик
  const allRev: { day_date: string; revenue: number }[] = []
  for (const f of funnels) {
    const revMetrics = f.metrics.filter((m) => m.role === 'revenue')
    for (const row of f.log) {
      let r = 0
      for (const m of revMetrics) {
        const v = row.values?.[m.key]
        if (typeof v === 'number' && Number.isFinite(v)) r += v
      }
      if (r !== 0) allRev.push({ day_date: row.day_date, revenue: r })
    }
  }
  const totalFact = allRev.reduce((s, r) => s + r.revenue, 0)
  const factByWeek = new Map<number, number>()
  for (const r of allRev) {
    const day = new Date(r.day_date + 'T00:00:00Z').getUTCDate()
    const wk = weeks.find((w) => day >= w.start && day <= w.end)
    if (!wk) continue
    factByWeek.set(wk.idx, (factByWeek.get(wk.idx) ?? 0) + r.revenue)
  }
  const remaining = Math.max(0, Number(tracker.revenue_plan_avg) - totalFact)
  const pct = Number(tracker.revenue_plan_avg) > 0 ? Math.round((totalFact / Number(tracker.revenue_plan_avg)) * 100) : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Позиція до плану</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat title="Ціль (середня)" value={fmt(Number(tracker.revenue_plan_avg))} />
          <Stat title="Факт місяця" value={fmt(totalFact)} highlight />
          <Stat title="% виконання" value={`${pct}%`} />
          <Stat title="Залишилось" value={fmt(remaining)} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <PlanField label="Мінімум" trackerId={tracker.id} projectId={projectId} field="revenue_plan_min" defaultValue={Number(tracker.revenue_plan_min)} />
          <PlanField label="Середній" trackerId={tracker.id} projectId={projectId} field="revenue_plan_avg" defaultValue={Number(tracker.revenue_plan_avg)} />
          <PlanField label="Максимум" trackerId={tracker.id} projectId={projectId} field="revenue_plan_max" defaultValue={Number(tracker.revenue_plan_max)} />
        </div>

        <CashFlowWeeks weeks={weeks} planByWeek={planByWeek} factByWeek={factByWeek} trackerId={tracker.id} projectId={projectId} year={tracker.year} month={tracker.month} />
      </CardContent>
    </Card>
  )
}

function CashFlowWeeks({
  weeks,
  planByWeek,
  factByWeek,
  trackerId,
  projectId,
  year,
  month,
}: {
  weeks: { idx: number; start: number; end: number }[]
  planByWeek: Map<number, number>
  factByWeek: Map<number, number>
  trackerId: string
  projectId: string
  year: number
  month: number
}) {
  // Визначаємо «поточну» неделю (якщо ми у цьому місяці)
  const today = new Date()
  const isCurrentMonth = today.getUTCFullYear() === year && today.getUTCMonth() + 1 === month
  const currentDay = today.getUTCDate()
  const currentWeekIdx = isCurrentMonth
    ? (weeks.find((w) => currentDay >= w.start && currentDay <= w.end)?.idx ?? weeks[0]!.idx)
    : weeks[0]!.idx
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? weeks : weeks.filter((w) => w.idx === currentWeekIdx)

  const renderRow = (w: { idx: number; start: number; end: number }, highlight = false) => {
    const fact = factByWeek.get(w.idx) ?? 0
    const plan = planByWeek.get(w.idx) ?? 0
    const wpct = plan > 0 ? Math.round((fact / plan) * 100) : 0
    const status = plan === 0 ? '—' : wpct >= 85 ? '🟢 в плані' : wpct >= 70 ? '🟡 нижче плану' : '🔴 критично'
    return (
      <tr key={w.idx} className={cn('hover:bg-muted/20', highlight && 'bg-muted/30')}>
        <td className="px-3 py-2">
          Тиждень {w.idx} ({w.start}–{w.end})
          {highlight ? <Badge variant="secondary" className="ml-2 text-[10px]">актуальна</Badge> : null}
        </td>
        <td className="px-3 py-2 text-right">
          <WeeklyPlanInput trackerId={trackerId} projectId={projectId} weekIndex={w.idx} defaultValue={plan} />
        </td>
        <td className="px-3 py-2 text-right font-medium">{fmt(fact)}</td>
        <td className="px-3 py-2 text-right">{plan > 0 ? `${wpct}%` : '—'}</td>
        <td className="px-3 py-2 text-center text-xs">{status}</td>
      </tr>
    )
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">Cash flow по тижнях</div>
        <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Згорнути' : `Показати всі (${weeks.length})`}
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Тиждень</th>
              <th className="px-3 py-2 text-right">План</th>
              <th className="px-3 py-2 text-right">Факт</th>
              <th className="px-3 py-2 text-right">% викон.</th>
              <th className="px-3 py-2 text-center">Статус</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.map((w) => renderRow(w, isCurrentMonth && w.idx === currentWeekIdx))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Stat({ title, value, highlight }: { title: string; value: string; highlight?: boolean }) {
  return (
    <div className={cn('rounded-md border p-3', highlight && 'border-foreground/30 bg-muted/30')}>
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{value}</div>
    </div>
  )
}

function PlanField({
  label,
  trackerId,
  projectId,
  field,
  defaultValue,
}: {
  label: string
  trackerId: string
  projectId: string
  field: string
  defaultValue: number
}) {
  const [, startTransition] = useTransition()
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step="any"
        defaultValue={defaultValue}
        onBlur={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v) && v !== defaultValue) startTransition(() => updateTrackerField(trackerId, projectId, field, v))
        }}
      />
    </div>
  )
}

function WeeklyPlanInput({
  trackerId,
  projectId,
  weekIndex,
  defaultValue,
}: {
  trackerId: string
  projectId: string
  weekIndex: number
  defaultValue: number
}) {
  const [, startTransition] = useTransition()
  return (
    <Input
      type="number"
      step="any"
      defaultValue={defaultValue || ''}
      placeholder="0"
      className="ml-auto h-7 max-w-[120px] text-right text-sm"
      onBlur={(e) => {
        const v = Number(e.target.value)
        if (Number.isFinite(v) && v !== defaultValue) startTransition(() => setWeeklyPlan(trackerId, projectId, weekIndex, v))
      }}
    />
  )
}

// Воронки: карточки + модалка с детальной панелью -----------
function FunnelsSection({
  projectId,
  tracker,
  funnels,
  products,
}: {
  projectId: string
  tracker: MonthlyTracker
  funnels: FullFunnel[]
  products: Product[]
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  const openFunnel = funnels.find((f) => f.id === openId) ?? null

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Воронки</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setNewOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Створити воронку
        </Button>
      </CardHeader>
      <CardContent>
        {funnels.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Воронок ще немає. Натисни «Створити воронку» — обери тип, отримаєш рекомендовані етапи.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {funnels.map((f) => (
              <FunnelCard key={f.id} funnel={f} onOpen={() => setOpenId(f.id)} />
            ))}
          </div>
        )}
      </CardContent>

      <NewFunnelDialog
        trackerId={tracker.id}
        projectId={projectId}
        products={products}
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(id) => setOpenId(id)}
      />

      {/* Деталь воронки в большом діалозі */}
      <Dialog open={openFunnel !== null} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
          {openFunnel ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {openFunnel.name}
                  {openFunnel.funnel_type ? (
                    <Badge variant="secondary">
                      {FUNNEL_TYPE_LABEL[openFunnel.funnel_type as FunnelType] ?? openFunnel.funnel_type}
                    </Badge>
                  ) : null}
                </DialogTitle>
              </DialogHeader>
              <FunnelDetail funnel={openFunnel} projectId={projectId} products={products} allFunnels={funnels} year={tracker.year} month={tracker.month} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function FunnelCard({ funnel, onOpen }: { funnel: FullFunnel; onOpen: () => void }) {
  // Семантические агрегаты по факту за весь журнал
  const totals = useMemo(() => {
    const agg = { revenue: 0, sales: 0, applications: 0, traffic: 0 }
    // «Заголовкова» метрика заявок: total (computed) → main (з upstream) → перша applications-роль
    const headlineApps =
      funnel.metrics.find((m) => m.key === 'application__total') ??
      funnel.metrics.find((m) => m.key === 'application__main') ??
      funnel.metrics.find((m) => m.role === 'applications')
    if (headlineApps) agg.applications = metricFact(headlineApps, funnel.log, funnel.metrics)
    for (const m of funnel.metrics) {
      const fact = m.computed_from?.length
        ? m.computed_from.reduce((s, k) => s + sumMetric(funnel.log, k), 0)
        : sumMetric(funnel.log, m.key)
      if (m.role === 'revenue') agg.revenue += fact
      else if (m.role === 'sales' && m.stage_group?.startsWith('payment')) agg.sales += fact
      else if (m.role === 'traffic_spend') agg.traffic += fact
    }
    return agg
  }, [funnel])

  const typeLabel = funnel.funnel_type ? FUNNEL_TYPE_LABEL[funnel.funnel_type as FunnelType] ?? funnel.funnel_type : null

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col rounded-md border bg-card/40 p-3 text-left transition-colors hover:border-foreground/30 hover:bg-card/60"
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{funnel.name}</div>
          {typeLabel ? <div className="truncate text-[11px] text-muted-foreground">{typeLabel}</div> : null}
        </div>
        {funnel.traffic_channels && funnel.traffic_channels.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-1">
            {funnel.traffic_channels.slice(0, 2).map((c) => (
              <Badge key={c} variant="secondary" className="text-[10px]">{c}</Badge>
            ))}
            {funnel.traffic_channels.length > 2 ? (
              <Badge variant="secondary" className="text-[10px]">+{funnel.traffic_channels.length - 2}</Badge>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <MiniStat label="Анкети" value={fmt(totals.applications)} />
        <MiniStat label="Продажі" value={fmt(totals.sales)} />
        <MiniStat label="Виручка, $" value={fmt(totals.revenue)} />
        <MiniStat label="Трафік, $" value={fmt(totals.traffic)} />
      </div>
    </button>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded bg-background px-2 py-1">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  )
}

function NewFunnelDialog({
  trackerId,
  projectId,
  products,
  open,
  onOpenChange,
  onCreated,
}: {
  trackerId: string
  projectId: string
  products: Product[]
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: (id: string) => void
}) {
  const [, startTransition] = useTransition()
  const [type, setType] = useState<FunnelType>('webinar')
  const [name, setName] = useState('')
  const [productIds, setProductIds] = useState<Set<string>>(new Set())
  const [trafficEnabled, setTrafficEnabled] = useState(true)
  const [channels, setChannels] = useState<Set<string>>(new Set())

  const defaults = FUNNEL_DEFAULTS[type]
  const isTripwire = type === 'tripwire'

  const toggleProduct = (id: string) => {
    setProductIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const toggleChannel = (c: string) => {
    setChannels((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c)
      else next.add(c)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Нова воронка</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Тип воронки</Label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as FunnelType)}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              {(Object.keys(FUNNEL_TYPE_LABEL) as FunnelType[]).map((t) => (
                <option key={t} value={t}>{FUNNEL_TYPE_LABEL[t]}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{FUNNEL_TYPE_HINT[type]}</p>
          </div>

          <div className="space-y-1">
            <Label>Назва</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='Наприклад: «Вебінар Іванов 19.05»' autoFocus />
          </div>

          <div className="space-y-1">
            <Label>Продукти, на які веде (можна декілька)</Label>
            {products.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                У проєкті ще немає продуктів. Спочатку заведи їх на вкладці «Продукти».
              </p>
            ) : (
              <div className="max-h-32 space-y-1 overflow-y-auto rounded-md border bg-background p-2">
                {products.map((p) => (
                  <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={productIds.has(p.id)}
                      onChange={() => toggleProduct(p.id)}
                    />
                    {p.name}
                    <span className="text-xs text-muted-foreground">— {fmt(Number(p.current_price))} $</span>
                  </label>
                ))}
              </div>
            )}
            {isTripwire ? (
              <p className="text-[11px] text-muted-foreground">
                У трипвайр-воронці тут продукт основної оплати. Ціни мини-продукту задаються після створення.
              </p>
            ) : null}
          </div>

          <div className="rounded-md border bg-muted/20 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={trafficEnabled} onChange={(e) => setTrafficEnabled(e.target.checked)} />
              Є платний трафік
            </label>
            {trafficEnabled ? (
              <div className="mt-2 space-y-1">
                <Label className="text-xs">Канали трафіку (можна декілька)</Label>
                <div className="grid grid-cols-2 gap-1">
                  {TRAFFIC_CHANNELS.map((c) => (
                    <label key={c} className="flex cursor-pointer items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={channels.has(c)}
                        onChange={() => toggleChannel(c)}
                      />
                      {c}
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Поля трафіку (Витрачено, Покази, Кліки, CR, та ін.) додаються після створення.
                </p>
              </div>
            ) : null}
          </div>

          <div className="rounded-md border bg-card/30 p-3">
            <div className="mb-1 text-xs text-muted-foreground">Будуть додані етапи (можна редагувати після):</div>
            <ul className="space-y-0.5 text-sm">
              {defaults.map((k) => {
                const t = getStageTemplate(k)
                return (
                  <li key={k}>· {t?.label ?? k}</li>
                )
              })}
            </ul>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Відміна</Button>
          <Button
            disabled={!name.trim()}
            onClick={() =>
              startTransition(async () => {
                const id = await createFunnel({
                  tracker_id: trackerId,
                  project_id: projectId,
                  name: name.trim(),
                  funnel_type: type,
                  product_ids: [...productIds],
                  traffic_enabled: trafficEnabled,
                  traffic_channels: [...channels],
                })
                if (id) onCreated(id)
                setName('')
                setType('webinar')
                setProductIds(new Set())
                setTrafficEnabled(true)
                setChannels(new Set())
                onOpenChange(false)
              })
            }
          >
            Створити
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Деталь воронки --------------------------------------------
function FunnelDetail({
  funnel,
  projectId,
  products,
  allFunnels,
  year,
  month,
}: {
  funnel: FullFunnel
  projectId: string
  products: Product[]
  allFunnels: FullFunnel[]
  year: number
  month: number
}) {
  const attachedProducts = useMemo(
    () => products.filter((p) => funnel.product_ids.includes(p.id)),
    [products, funnel.product_ids],
  )
  const otherFunnels = useMemo(() => allFunnels.filter((f) => f.id !== funnel.id), [allFunnels, funnel.id])
  return (
    <div className="space-y-5">
      <FunnelSettings funnel={funnel} projectId={projectId} products={products} />
      <DerivedStats funnel={funnel} />
      {funnel.reactivations_in.length > 0 ? (
        <ReactivationInSection funnel={funnel} allFunnels={allFunnels} />
      ) : null}
      <FunnelStages funnel={funnel} projectId={projectId} />
      {attachedProducts.length > 1 ? (
        <ProductSalesSection funnel={funnel} projectId={projectId} products={attachedProducts} year={year} month={month} />
      ) : null}
      {otherFunnels.length > 0 ? (
        <ReactivationOutSection funnel={funnel} projectId={projectId} otherFunnels={otherFunnels} year={year} month={month} />
      ) : null}
      <FunnelLog
        funnel={funnel}
        projectId={projectId}
        year={year}
        month={month}
        products={attachedProducts.length > 0 ? attachedProducts : products}
        otherFunnels={otherFunnels}
      />
    </div>
  )
}

// Реактивация: список лідів, переданих з цієї воронки в інші ----
function ReactivationOutSection({
  funnel,
  projectId,
  otherFunnels,
  year,
  month,
}: {
  funnel: FullFunnel
  projectId: string
  otherFunnels: FullFunnel[]
  year: number
  month: number
}) {
  const [, startTransition] = useTransition()
  const [day, setDay] = useState(dayIso(year, month, new Date().getUTCDate()))
  const [targetId, setTargetId] = useState<string>(otherFunnels[0]?.id ?? '')
  const [count, setCount] = useState('')

  const submit = () => {
    if (!targetId) return
    const c = Number(count)
    if (!Number.isFinite(c) || c <= 0) return
    startTransition(async () => {
      await upsertReactivation({
        source_funnel_id: funnel.id,
        target_funnel_id: targetId,
        project_id: projectId,
        day_date: day,
        count: c,
      })
      setCount('')
    })
  }

  const rows = [...funnel.reactivations_out].sort((a, b) => b.day_date.localeCompare(a.day_date))
  const funnelById = new Map(otherFunnels.map((f) => [f.id, f.name]))
  const total = rows.reduce((s, r) => s + r.count, 0)

  return (
    <div className="rounded-md border bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">Реактивація: перенос лідів</div>
        <div className="text-xs text-muted-foreground">Всього: {fmt(total)}</div>
      </div>

      {otherFunnels.length === 0 ? (
        <p className="text-xs text-muted-foreground">Інших воронок немає — створи цільову, щоб переносити в неї лідів.</p>
      ) : (
        <>
          <div className="grid grid-cols-[140px_1fr_90px_auto] gap-2 rounded-md border bg-background p-2">
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-8 text-xs" />
            <select
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              {otherFunnels.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <Input type="number" min={0} step={1} value={count} onChange={(e) => setCount(e.target.value)} placeholder="К-сть" className="h-8 text-xs" />
            <Button size="sm" onClick={submit} disabled={!targetId || !count}>+ Перенести</Button>
          </div>

          {rows.length > 0 ? (
            <ul className="mt-2 divide-y rounded-md border bg-background">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs">
                  <span className="text-muted-foreground">
                    {new Date(r.day_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
                  </span>
                  <span className="flex-1 truncate">→ {funnelById.get(r.target_funnel_id) ?? '—'}</span>
                  <span className="font-medium">{fmt(r.count)}</span>
                  <button
                    type="button"
                    onClick={() => startTransition(() => deleteReactivation(r.id, projectId))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Поки що нічого не передавали.</p>
          )}
        </>
      )}
    </div>
  )
}

// Реактивация: вхідні ліди в цю воронку (read-only) ------------
function ReactivationInSection({
  funnel,
  allFunnels,
}: {
  funnel: FullFunnel
  allFunnels: FullFunnel[]
}) {
  const funnelById = new Map(allFunnels.map((f) => [f.id, f.name]))
  // згрупуємо по source funnel
  const bySource = new Map<string, number>()
  for (const r of funnel.reactivations_in) {
    bySource.set(r.source_funnel_id, (bySource.get(r.source_funnel_id) ?? 0) + r.count)
  }
  const total = funnel.reactivations_in.reduce((s, r) => s + r.count, 0)
  return (
    <div className="rounded-md border bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">Реактивація: вхідні</div>
        <div className="text-xs text-muted-foreground">Всього лідів: {fmt(total)}</div>
      </div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {[...bySource.entries()].map(([src, c]) => (
          <div key={src} className="flex items-center justify-between rounded-md border bg-background px-2 py-1 text-xs">
            <span className="truncate text-muted-foreground">з «{funnelById.get(src) ?? '—'}»</span>
            <span className="font-medium">{fmt(c)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Продажі по продуктах: для воронок з кількома продуктами -------
function ProductSalesSection({
  funnel,
  projectId,
  products,
  year,
  month,
}: {
  funnel: FullFunnel
  projectId: string
  products: Product[]
  year: number
  month: number
}) {
  const [, startTransition] = useTransition()
  const [day, setDay] = useState(dayIso(year, month, new Date().getUTCDate()))
  const [productId, setProductId] = useState<string>(products[0]?.id ?? '')
  const [count, setCount] = useState('')
  const [amount, setAmount] = useState('')

  const submit = () => {
    if (!productId) return
    const c = Number(count)
    const a = Number(amount)
    if ((!Number.isFinite(c) || c <= 0) && (!Number.isFinite(a) || a <= 0)) return
    startTransition(async () => {
      await upsertProductSale({
        funnel_id: funnel.id,
        project_id: projectId,
        product_id: productId,
        day_date: day,
        count: Number.isFinite(c) ? c : 0,
        amount: Number.isFinite(a) ? a : 0,
      })
      setCount('')
      setAmount('')
    })
  }

  const rows = [...funnel.product_sales].sort((a, b) => b.day_date.localeCompare(a.day_date))
  const productName = new Map(products.map((p) => [p.id, p.name]))
  const totalCount = rows.reduce((s, r) => s + r.count, 0)
  const totalAmount = rows.reduce((s, r) => s + Number(r.amount), 0)

  return (
    <div className="rounded-md border bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">Продажі по продуктах</div>
        <div className="text-xs text-muted-foreground">
          {fmt(totalCount)} шт · {fmt(totalAmount)} $
        </div>
      </div>

      <div className="grid grid-cols-[140px_1fr_80px_90px_auto] gap-2 rounded-md border bg-background p-2">
        <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-8 text-xs" />
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          className="h-8 rounded-md border border-input bg-background px-2 text-xs"
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <Input type="number" min={0} step={1} value={count} onChange={(e) => setCount(e.target.value)} placeholder="К-сть" className="h-8 text-xs" />
        <Input type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$" className="h-8 text-xs" />
        <Button size="sm" onClick={submit} disabled={!productId || (!count && !amount)}>+ Продаж</Button>
      </div>

      {rows.length > 0 ? (
        <ul className="mt-2 divide-y rounded-md border bg-background">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs">
              <span className="text-muted-foreground">
                {new Date(r.day_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
              </span>
              <span className="flex-1 truncate">{productName.get(r.product_id) ?? '—'}</span>
              <span>{fmt(r.count)} шт</span>
              <span className="font-medium">{fmt(Number(r.amount))} $</span>
              <button
                type="button"
                onClick={() => startTransition(() => deleteProductSale(r.id, projectId))}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">Ще немає продажів. Додай рядок вище — оберіть продукт.</p>
      )}
    </div>
  )
}

// Автоматичні розрахункові метрики
function DerivedStats({ funnel }: { funnel: FullFunnel }) {
  const derived = useMemo(() => computeDerivedMetrics(funnel.metrics, funnel.log), [funnel])
  const conversions = useMemo(() => computeStageConversions(funnel.metrics, funnel.log), [funnel])

  if (derived.length === 0 && conversions.length === 0) return null

  return (
    <div className="rounded-md border bg-card/40 p-3">
      <div className="mb-2 text-sm font-medium">Автоматичні розрахунки</div>
      {derived.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {derived.map((d) => (
            <div key={d.key} className="rounded-md border bg-background px-2 py-1.5">
              <div className="text-[10px] uppercase text-muted-foreground">{d.label}</div>
              <div className="text-sm font-medium">
                {fmt(d.value)}
                {d.unit ? <span className="ml-0.5 text-xs text-muted-foreground">{d.unit}</span> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {conversions.length > 0 ? (
        <div className="mt-3 border-t pt-2">
          <div className="mb-1 text-xs font-medium text-muted-foreground">Конверсії між етапами</div>
          <div className="flex flex-wrap gap-2">
            {conversions.map((c, i) => (
              <div key={i} className="rounded-md border bg-background px-2 py-1 text-xs">
                <span className="text-muted-foreground">{c.from_label}</span>
                <span className="mx-1">→</span>
                <span className="text-muted-foreground">{c.to_label}</span>
                <span className="ml-2 font-medium">{fmt(c.value)}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function FunnelSettings({
  funnel,
  projectId,
  products,
}: {
  funnel: FullFunnel
  projectId: string
  products: Product[]
}) {
  const [, startTransition] = useTransition()
  const [newPriceName, setNewPriceName] = useState('')
  const [newPriceVal, setNewPriceVal] = useState('')
  const isTripwire = funnel.funnel_type === 'tripwire'

  const toggleProduct = (pid: string) => {
    const next = new Set(funnel.product_ids)
    if (next.has(pid)) next.delete(pid)
    else next.add(pid)
    startTransition(() => setFunnelProducts(funnel.id, projectId, [...next]))
  }
  const toggleChannel = (c: string) => {
    const next = new Set(funnel.traffic_channels ?? [])
    if (next.has(c)) next.delete(c)
    else next.add(c)
    startTransition(() => updateFunnel(funnel.id, projectId, { traffic_channels: [...next] }))
  }

  return (
    <div className="space-y-3 rounded-md border bg-card/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Назва</Label>
          <Input
            defaultValue={funnel.name}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== funnel.name) startTransition(() => updateFunnel(funnel.id, projectId, { name: v }))
            }}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Тип</Label>
          <select
            defaultValue={funnel.funnel_type ?? ''}
            onChange={(e) =>
              startTransition(() => updateFunnel(funnel.id, projectId, { funnel_type: e.target.value as FunnelType }))
            }
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {(Object.keys(FUNNEL_TYPE_LABEL) as FunnelType[]).map((t) => (
              <option key={t} value={t}>{FUNNEL_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Продукти (можна декілька)</Label>
        {products.length === 0 ? (
          <p className="text-xs text-muted-foreground">У проєкті немає продуктів.</p>
        ) : (
          <div className="grid grid-cols-2 gap-1 rounded-md border bg-background p-2 sm:grid-cols-3">
            {products.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input type="checkbox" checked={funnel.product_ids.includes(p.id)} onChange={() => toggleProduct(p.id)} />
                <span className="truncate">{p.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Ціни мини-продукту — лише для типу tripwire */}
      {isTripwire ? (
        <div className="space-y-1">
          <Label className="text-xs">Ціни мини-продукту</Label>
          <div className="rounded-md border bg-background p-2">
            {funnel.mini_prices.length === 0 ? (
              <p className="text-xs text-muted-foreground">Поки немає тарифів</p>
            ) : (
              <ul className="space-y-1">
                {funnel.mini_prices.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                    <span>{p.name}</span>
                    <span className="font-medium">{fmt(Number(p.price))} $</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => startTransition(() => deleteMiniPrice(p.id, projectId))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1 grid grid-cols-[1fr_80px_auto] gap-1">
              <Input value={newPriceName} onChange={(e) => setNewPriceName(e.target.value)} placeholder="Назва тарифу" className="h-7 text-xs" />
              <Input type="number" value={newPriceVal} onChange={(e) => setNewPriceVal(e.target.value)} placeholder="$" className="h-7 text-xs" />
              <Button
                size="sm"
                disabled={!newPriceName.trim() || !newPriceVal}
                onClick={() =>
                  startTransition(async () => {
                    await addMiniPrice(funnel.id, projectId, newPriceName.trim(), Number(newPriceVal))
                    setNewPriceName('')
                    setNewPriceVal('')
                  })
                }
              >
                +
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 border-t pt-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            defaultChecked={funnel.traffic_enabled}
            onChange={(e) =>
              startTransition(() => updateFunnel(funnel.id, projectId, { traffic_enabled: e.target.checked }))
            }
          />
          Платний трафік
        </label>
        {funnel.traffic_enabled ? (
          <div className="flex flex-1 flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Канали:</span>
            {TRAFFIC_CHANNELS.map((c) => {
              const active = (funnel.traffic_channels ?? []).includes(c)
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleChannel(c)}
                  className={cn(
                    'rounded-md border px-2 py-0.5 text-[11px] transition-colors',
                    active ? 'border-foreground bg-muted' : 'text-muted-foreground hover:bg-muted/30',
                  )}
                >
                  {c}
                </button>
              )
            })}
          </div>
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto text-destructive hover:text-destructive"
          onClick={() => {
            if (confirm(`Видалити воронку «${funnel.name}» зі всіма даними?`)) {
              startTransition(() => deleteFunnel(funnel.id, projectId))
            }
          }}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          Видалити воронку
        </Button>
      </div>
    </div>
  )
}

// Этапы воронки (стейдж-группы) -----------------------------
function FunnelStages({ funnel, projectId }: { funnel: FullFunnel; projectId: string }) {
  const [, startTransition] = useTransition()
  const [libOpen, setLibOpen] = useState(false)
  const [showPlans, setShowPlans] = useState(false)
  const stages = groupedByStage(funnel.metrics)

  const hasTraffic = stages.some((s) => s.stage_group === 'traffic')
  const existingTrafficKeys = new Set(
    funnel.metrics.filter((m) => m.stage_group === 'traffic').map((m) => m.key.replace('traffic__', '')),
  )
  const trafficLeft = TRAFFIC_FIELDS.filter((f) => !existingTrafficKeys.has(f.key))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">Етапи воронки</div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setShowPlans((v) => !v)}>
            {showPlans ? 'Сховати цілі' : 'Цілі'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLibOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Додати етап
          </Button>
        </div>
      </div>

      {/* Параметри трафіку (якщо включений трафік) */}
      {funnel.traffic_enabled ? (
        <div className="rounded-md border bg-card/40 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-medium">Параметри трафіку</div>
            <div className="flex flex-wrap gap-1">
              {trafficLeft.map((tf) => (
                <Button
                  key={tf.key}
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    startTransition(() =>
                      addTrafficField({
                        funnel_id: funnel.id,
                        project_id: projectId,
                        key: tf.key,
                        label: tf.label,
                        role: tf.role === 'traffic_spend' ? 'traffic_spend' : 'other',
                        unit: tf.unit ?? undefined,
                      }),
                    )
                  }
                >
                  + {tf.label}
                </Button>
              ))}
            </div>
          </div>
          {hasTraffic ? (
            <StageMetricsTable metrics={stages.find((s) => s.stage_group === 'traffic')!.metrics} log={funnel.log} projectId={projectId} allMetrics={funnel.metrics} showPlans={showPlans} />
          ) : (
            <p className="text-xs text-muted-foreground">Додай хоча б «Витрачено».</p>
          )}
        </div>
      ) : null}

      {/* Етапи воронки (крім трафіку) */}
      {stages.filter((s) => s.stage_group !== 'traffic').length === 0 ? (
        <p className="text-sm text-muted-foreground">Етапів немає. Додай з бібліотеки.</p>
      ) : (
        stages
          .filter((s) => s.stage_group !== 'traffic')
          .map((s) => (
            <div key={s.stage_group} className="rounded-md border bg-card/40 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-medium">{s.label}</div>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Видалити етап «${s.label}»?`)) {
                      startTransition(() => deleteStage(funnel.id, projectId, s.stage_group))
                    }
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <StageMetricsTable metrics={s.metrics} log={funnel.log} projectId={projectId} allMetrics={funnel.metrics} showPlans={showPlans} />
            </div>
          ))
      )}

      <LibraryDialog funnelId={funnel.id} projectId={projectId} existingGroups={new Set(stages.map((s) => s.stage_group.replace(/_(\d+)$/, '')))} open={libOpen} onOpenChange={setLibOpen} />
    </div>
  )
}

function StageMetricsTable({
  metrics,
  log,
  projectId,
  allMetrics,
  showPlans,
}: {
  metrics: FunnelMetric[]
  log: FunnelDailyLog[]
  projectId: string
  allMetrics: FunnelMetric[]
  showPlans: boolean
}) {
  const [, startTransition] = useTransition()
  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5 text-left">Метрика</th>
            <th className="px-3 py-1.5 text-left">Од.</th>
            {showPlans ? <th className="px-3 py-1.5 text-right">План</th> : null}
            <th className="px-3 py-1.5 text-right">Факт</th>
            {showPlans ? <th className="px-3 py-1.5 text-right">%</th> : null}
            <th className="px-3 py-1.5"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {metrics.map((m) => {
            const fact = metricFact(m, log, allMetrics)
            const pct = m.plan_value > 0 ? Math.round((fact / Number(m.plan_value)) * 100) : 0
            const isComputed = isAutoMetric(m, allMetrics)
            return (
              <tr key={m.id} className="hover:bg-muted/10">
                <td className="px-3 py-1">
                  <span className="text-sm">{m.label}</span>
                  {isComputed ? <Badge variant="secondary" className="ml-2 text-[10px]">авто</Badge> : null}
                </td>
                <td className="px-3 py-1 text-xs text-muted-foreground">{m.unit ?? '—'}</td>
                {showPlans ? (
                  <td className="px-3 py-1 text-right">
                    <Input
                      type="number"
                      step="any"
                      defaultValue={Number(m.plan_value) || ''}
                      className="ml-auto h-7 w-24 text-right text-sm"
                      onBlur={(e) => {
                        const v = Number(e.target.value) || 0
                        if (v !== Number(m.plan_value)) startTransition(() => updateMetric(m.id, projectId, { plan_value: v }))
                      }}
                    />
                  </td>
                ) : null}
                <td className="px-3 py-1 text-right font-medium">{fmt(fact)}</td>
                {showPlans ? (
                  <td className="px-3 py-1 text-right text-xs text-muted-foreground">
                    {m.plan_value > 0 ? `${pct}%` : '—'}
                  </td>
                ) : null}
                <td className="px-3 py-1 text-right">
                  {!isComputed ? (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Видалити метрику «${m.label}»?`)) startTransition(() => deleteMetric(m.id, projectId))
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function LibraryDialog({
  funnelId,
  projectId,
  existingGroups,
  open,
  onOpenChange,
}: {
  funnelId: string
  projectId: string
  existingGroups: Set<string> // ключі без варіанта
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [, startTransition] = useTransition()
  const grouped = useMemo(() => {
    const m = new Map<StageGroup, StageTemplate[]>()
    for (const tpl of STAGE_LIBRARY) {
      if (!m.has(tpl.group)) m.set(tpl.group, [])
      m.get(tpl.group)!.push(tpl)
    }
    return m
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Бібліотека етапів</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {(['entry', 'warmup', 'qualification', 'payment', 'special'] as StageGroup[]).map((g) => (
            <div key={g}>
              <div className="mb-1 text-xs font-medium uppercase text-muted-foreground">{STAGE_GROUP_LABEL[g]}</div>
              <div className="grid gap-1">
                {(grouped.get(g) ?? []).map((tpl) => {
                  const isMultiple = (tpl.variants ?? 1) > 1
                  const isExisting = existingGroups.has(tpl.template) && !isMultiple
                  return (
                    <button
                      key={tpl.template}
                      type="button"
                      disabled={isExisting}
                      onClick={() =>
                        startTransition(async () => {
                          await addStageFromTemplate(funnelId, projectId, tpl.template)
                          onOpenChange(false)
                        })
                      }
                      className={cn(
                        'flex items-start justify-between rounded-md border p-2 text-left text-sm transition-colors',
                        isExisting
                          ? 'cursor-not-allowed opacity-50'
                          : 'hover:border-foreground/40 hover:bg-muted/40',
                      )}
                    >
                      <div>
                        <div className="font-medium">{tpl.label}</div>
                        {tpl.hint ? <div className="text-xs text-muted-foreground">{tpl.hint}</div> : null}
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {tpl.metrics.length} метрик{tpl.metrics.length > 1 ? 'и' : 'а'}
                          {isMultiple ? ` · до ${tpl.variants} разів` : ''}
                        </div>
                      </div>
                      {isExisting ? <span className="text-xs text-muted-foreground">✓ уже додано</span> : <Plus className="h-4 w-4 self-center text-muted-foreground" />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Дневной лог: кнопка → модалка + историческая таблица --------
function FunnelLog({
  funnel,
  projectId,
  year,
  month,
  products,
  otherFunnels,
}: {
  funnel: FullFunnel
  projectId: string
  year: number
  month: number
  products: Product[]
  otherFunnels: FullFunnel[]
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  // payment-стейдж і reactivation_out тепер живуть в окремих секціях день-діалогу,
  // тому в звичайних метриках їх ховаємо.
  const editableMetrics = funnel.metrics.filter((m) => {
    if (isAutoMetric(m, funnel.metrics)) return false
    if (m.stage_group === 'payment') return false
    if (m.stage_group === 'reactivation_out') return false
    return true
  })
  const hasPaymentStage = funnel.metrics.some((m) => m.stage_group === 'payment')
  const canOpenDay = editableMetrics.length > 0 || hasPaymentStage

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Журнал по днях</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={!canOpenDay} onClick={() => setHistoryOpen(true)}>
            Історія
          </Button>
          <Button size="sm" disabled={!canOpenDay} onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Внести дані за день
          </Button>
        </div>
      </div>

      {!canOpenDay ? (
        <p className="text-xs text-muted-foreground">Додай етапи з бібліотеки — і зʼявиться можливість вести журнал.</p>
      ) : funnel.log.length === 0 ? (
        <p className="text-xs text-muted-foreground">Записів ще немає. Натисни «Внести дані за день».</p>
      ) : (
        <div className="rounded-md border bg-card/40 p-2 text-xs text-muted-foreground">
          Останні записи: {[...funnel.log].slice(-3).reverse().map((r) => new Date(r.day_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })).join(', ')}
          {funnel.log.length > 3 ? ` · усього ${funnel.log.length}` : null}
        </div>
      )}

      <AddDayDialog
        funnel={funnel}
        projectId={projectId}
        year={year}
        month={month}
        editableMetrics={editableMetrics}
        hasPaymentStage={hasPaymentStage}
        products={products}
        otherFunnels={otherFunnels}
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      <HistoryDialog
        funnel={funnel}
        projectId={projectId}
        editableMetrics={editableMetrics}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  )
}

function AddDayDialog({
  funnel,
  projectId,
  year,
  month,
  editableMetrics,
  hasPaymentStage,
  products,
  otherFunnels,
  open,
  onOpenChange,
}: {
  funnel: FullFunnel
  projectId: string
  year: number
  month: number
  editableMetrics: FunnelMetric[]
  hasPaymentStage: boolean
  products: Product[]
  otherFunnels: FullFunnel[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [, startTransition] = useTransition()
  const [day, setDay] = useState(dayIso(year, month, new Date().getUTCDate()))
  const [values, setValues] = useState<Record<string, string>>({})
  const [comment, setComment] = useState('')
  const [payProduct, setPayProduct] = useState<string>(products[0]?.id ?? '')
  const [payCount, setPayCount] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [reactTarget, setReactTarget] = useState<string>(otherFunnels[0]?.id ?? '')
  const [reactCount, setReactCount] = useState('')

  // Якщо для цього дня вже є запис — підставимо
  const existing = funnel.log.find((r) => r.day_date === day)
  useMemo(() => {
    if (existing) {
      const vals: Record<string, string> = {}
      for (const m of editableMetrics) {
        const v = existing.values?.[m.key]
        vals[m.key] = v !== undefined && v !== 0 ? String(v) : ''
      }
      setValues(vals)
      setComment(existing.comment ?? '')
    } else {
      setValues({})
      setComment('')
    }
    // скидаємо чернетку payment + реактивації при зміні дня
    setPayCount('')
    setPayAmount('')
    setReactCount('')
    if (!payProduct && products[0]) setPayProduct(products[0].id)
    if (!reactTarget && otherFunnels[0]) setReactTarget(otherFunnels[0].id)
  }, [day, existing, editableMetrics, products, otherFunnels])

  // Продажі продуктів за обраний день
  const todaySales = funnel.product_sales.filter((s) => s.day_date === day)
  // Переноси з реактивації за обраний день
  const todayReact = funnel.reactivations_out.filter((r) => r.day_date === day)
  const funnelNameById = new Map(otherFunnels.map((f) => [f.id, f.name]))

  const addPaymentRow = async () => {
    if (!payProduct) return
    const c = Number(payCount)
    const a = Number(payAmount)
    if ((!Number.isFinite(c) || c <= 0) && (!Number.isFinite(a) || a <= 0)) return
    await upsertProductSale({
      funnel_id: funnel.id,
      project_id: projectId,
      product_id: payProduct,
      day_date: day,
      count: Number.isFinite(c) ? c : 0,
      amount: Number.isFinite(a) ? a : 0,
    })
    setPayCount('')
    setPayAmount('')
  }

  const addReactivationRow = async () => {
    if (!reactTarget) return
    const c = Number(reactCount)
    if (!Number.isFinite(c) || c <= 0) return
    await upsertReactivation({
      source_funnel_id: funnel.id,
      target_funnel_id: reactTarget,
      project_id: projectId,
      day_date: day,
      count: c,
    })
    setReactCount('')
  }

  const submit = () => {
    const vals: Record<string, number> = {}
    for (const m of editableMetrics) {
      const v = Number(values[m.key])
      if (Number.isFinite(v) && v !== 0) vals[m.key] = v
    }
    startTransition(async () => {
      await upsertDailyLog(funnel.id, projectId, day, vals, comment || null)
      // якщо у формі payment-чернетка заповнена — теж зберігаємо
      if ((Number(payCount) > 0 || Number(payAmount) > 0) && payProduct) {
        await addPaymentRow()
      }
      // якщо чернетка реактивації заповнена — теж зберігаємо
      if (Number(reactCount) > 0 && reactTarget) {
        await addReactivationRow()
      }
      onOpenChange(false)
    })
  }

  // Групуємо за етапами для зручності
  const grouped = groupedByStage(editableMetrics)
  const productName = new Map(products.map((p) => [p.id, p.name]))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Дані за день — {funnel.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Дата</Label>
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            <div className="text-[11px] text-muted-foreground">
              {dayOfWeek(day)}
              {existing ? ' · є запис, редагуєш' : ''}
            </div>
          </div>

          {grouped.map((g) => (
            <div key={g.stage_group} className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">{g.label}</div>
              <div className="grid grid-cols-2 gap-2">
                {g.metrics.map((m) => (
                  <div key={m.id} className="space-y-0.5">
                    <Label className="text-[11px]">
                      {m.label}
                      {m.unit ? <span className="ml-1 text-muted-foreground">({m.unit})</span> : null}
                    </Label>
                    <Input
                      type="number"
                      step="any"
                      value={values[m.key] ?? ''}
                      onChange={(e) => setValues((s) => ({ ...s, [m.key]: e.target.value }))}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {otherFunnels.length > 0 ? (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Реактивація: куди передали лідів</div>
              {todayReact.length > 0 ? (
                <ul className="divide-y rounded-md border bg-background text-xs">
                  {todayReact.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                      <span className="flex-1 truncate">→ {funnelNameById.get(r.target_funnel_id) ?? '—'}</span>
                      <span className="font-medium">{fmt(r.count)}</span>
                      <button
                        type="button"
                        onClick={() => startTransition(() => deleteReactivation(r.id, projectId))}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="grid grid-cols-[1fr_90px_auto] gap-2 rounded-md border bg-background p-2">
                <select
                  value={reactTarget}
                  onChange={(e) => setReactTarget(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                >
                  {otherFunnels.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={reactCount}
                  onChange={(e) => setReactCount(e.target.value)}
                  placeholder="К-сть"
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!reactTarget || !reactCount}
                  onClick={() => startTransition(() => addReactivationRow())}
                >
                  +
                </Button>
              </div>
            </div>
          ) : null}

          {hasPaymentStage ? (
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Оплата основного продукту</div>
              {products.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Спершу прив'яжи хоча б один продукт у налаштуваннях воронки.
                </p>
              ) : (
                <>
                  {todaySales.length > 0 ? (
                    <ul className="divide-y rounded-md border bg-background text-xs">
                      {todaySales.map((s) => (
                        <li key={s.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                          <span className="flex-1 truncate">{productName.get(s.product_id) ?? '—'}</span>
                          <span>{fmt(s.count)} шт</span>
                          <span className="font-medium">{fmt(Number(s.amount))} $</span>
                          <button
                            type="button"
                            onClick={() => startTransition(() => deleteProductSale(s.id, projectId))}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div
                    className={cn(
                      'grid gap-2 rounded-md border bg-background p-2',
                      products.length > 1
                        ? 'grid-cols-[1fr_70px_90px_auto]'
                        : 'grid-cols-[1fr_90px_auto]',
                    )}
                  >
                    {products.length > 1 ? (
                      <select
                        value={payProduct}
                        onChange={(e) => setPayProduct(e.target.value)}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    ) : (
                      <div className="flex h-8 items-center px-2 text-xs text-muted-foreground">
                        {products[0]?.name}
                      </div>
                    )}
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={payCount}
                      onChange={(e) => setPayCount(e.target.value)}
                      placeholder="К-сть"
                      className="h-8 text-xs"
                    />
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      placeholder="$"
                      className="h-8 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!payProduct || (!payCount && !payAmount)}
                      onClick={() => startTransition(() => addPaymentRow())}
                    >
                      +
                    </Button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          <div className="space-y-1">
            <Label className="text-xs">Коментар (опц.)</Label>
            <Textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Відміна</Button>
          <Button onClick={submit}>Зберегти</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type RangePreset = 'week' | 'month' | 'all' | 'custom'

function HistoryDialog({
  funnel,
  projectId,
  editableMetrics,
  open,
  onOpenChange,
}: {
  funnel: FullFunnel
  projectId: string
  editableMetrics: FunnelMetric[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const today = useMemo(() => new Date(), [])
  const todayIso = useMemo(() => today.toISOString().slice(0, 10), [today])
  const [preset, setPreset] = useState<RangePreset>('all')
  const [customFrom, setCustomFrom] = useState<string>(todayIso)
  const [customTo, setCustomTo] = useState<string>(todayIso)

  const { from, to } = useMemo(() => {
    if (preset === 'all') return { from: '0000-01-01', to: '9999-12-31' }
    if (preset === 'custom') return { from: customFrom, to: customTo }
    const d = new Date()
    if (preset === 'week') {
      const start = new Date(d)
      start.setUTCDate(d.getUTCDate() - 6)
      return { from: start.toISOString().slice(0, 10), to: d.toISOString().slice(0, 10) }
    }
    const start = new Date(d)
    start.setUTCDate(1)
    return { from: start.toISOString().slice(0, 10), to: d.toISOString().slice(0, 10) }
  }, [preset, customFrom, customTo])

  const inRange = (d: string) => d >= from && d <= to
  const filteredLog = useMemo(() => funnel.log.filter((r) => inRange(r.day_date)), [funnel.log, from, to])
  const derived = useMemo(
    () => computeDerivedMetrics(funnel.metrics, funnel.log, inRange),
    [funnel.metrics, funnel.log, from, to],
  )

  // Сортування за потоком
  const orderedMetrics = useMemo(() => {
    return [...editableMetrics].sort((a, b) => {
      const pa = stageFlowPriority(a.stage_group ?? 'other')
      const pb = stageFlowPriority(b.stage_group ?? 'other')
      if (pa !== pb) return pa - pb
      return a.position - b.position
    })
  }, [editableMetrics])

  // Видимість метрик (за замовч. усі видимі). Зберігаємо ключі прихованих.
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [pickerOpen, setPickerOpen] = useState(false)
  const visibleMetrics = useMemo(
    () => orderedMetrics.filter((m) => !hidden.has(m.key)),
    [orderedMetrics, hidden],
  )

  // По кожній метриці: серія днів + сумма / макс
  const seriesByMetric = useMemo(() => {
    const out = new Map<string, { series: { day: string; value: number }[]; total: number; peak: number }>()
    const sortedLog = [...filteredLog].sort((a, b) => a.day_date.localeCompare(b.day_date))
    for (const m of visibleMetrics) {
      const series = sortedLog
        .map((r) => ({ day: r.day_date, value: Number(r.values?.[m.key]) || 0 }))
        .filter((p) => p.value !== 0)
      const total = series.reduce((s, p) => s + p.value, 0)
      const peak = series.reduce((mx, p) => (p.value > mx ? p.value : mx), 0)
      out.set(m.key, { series, total, peak })
    }
    return out
  }, [visibleMetrics, filteredLog])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[98vw]">
        <DialogHeader>
          <DialogTitle>Історія — {funnel.name}</DialogTitle>
        </DialogHeader>

        {/* Фільтр діапазону */}
        <div className="flex flex-wrap items-center gap-2 border-b pb-3">
          {(['week', 'month', 'all', 'custom'] as RangePreset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={cn(
                'rounded-md border px-3 py-1 text-xs transition-colors',
                preset === p ? 'border-foreground bg-muted' : 'text-muted-foreground hover:bg-muted/30',
              )}
            >
              {p === 'week' ? 'Тиждень' : p === 'month' ? 'Місяць' : p === 'all' ? 'Усе' : 'Custom'}
            </button>
          ))}
          {preset === 'custom' ? (
            <div className="flex items-center gap-1 text-xs">
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-7 w-36" />
              <span>—</span>
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-7 w-36" />
            </div>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-muted/30"
            >
              Показники {hidden.size > 0 ? `(${orderedMetrics.length - hidden.size}/${orderedMetrics.length})` : ''}
            </button>
            <span className="text-xs text-muted-foreground">{filteredLog.length} записів</span>
          </div>
        </div>

        {pickerOpen ? (
          <div className="rounded-md border bg-card/40 p-2">
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[11px] font-medium text-muted-foreground">Які показники показувати</div>
              <div className="flex gap-2 text-[11px]">
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setHidden(new Set())}>усі</button>
                <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setHidden(new Set(orderedMetrics.map((m) => m.key)))}>жодного</button>
              </div>
            </div>
            <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {orderedMetrics.map((m) => {
                const isOn = !hidden.has(m.key)
                return (
                  <label key={m.id} className="flex cursor-pointer items-center gap-1.5 text-[11px]">
                    <input
                      type="checkbox"
                      checked={isOn}
                      onChange={() => {
                        setHidden((prev) => {
                          const next = new Set(prev)
                          if (isOn) next.add(m.key)
                          else next.delete(m.key)
                          return next
                        })
                      }}
                    />
                    <span className={cn('truncate', !isOn && 'text-muted-foreground line-through')}>{m.label}</span>
                  </label>
                )
              })}
            </div>
          </div>
        ) : null}

        {/* Автоматичні розрахунки за період */}
        {derived.length > 0 ? (
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">Автоматичні розрахунки за період</div>
            <div className="grid gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {derived.map((d) => (
                <div key={d.key} className="rounded-md border bg-card/40 p-2">
                  <div className="text-[10px] uppercase text-muted-foreground">{d.label}</div>
                  <div className="text-sm font-medium">
                    {fmt(d.value)}
                    {d.unit ? <span className="ml-0.5 text-xs text-muted-foreground">{d.unit}</span> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Всі метрики як міні-графіки */}
        {visibleMetrics.length > 0 ? (
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">Метрики по днях</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {visibleMetrics.map((m) => {
                const s = seriesByMetric.get(m.key)
                return (
                  <MetricMiniChart
                    key={m.id}
                    label={m.label}
                    unit={m.unit}
                    series={s?.series ?? []}
                    total={s?.total ?? 0}
                    peak={s?.peak ?? 0}
                  />
                )
              })}
            </div>
          </div>
        ) : null}

        {/* Таблиця по днях */}
        {filteredLog.length > 0 ? (
          <div>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground">Таблиця</div>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
                  <tr>
                    <th className="sticky left-0 z-10 bg-muted/40 px-1.5 py-1.5 text-left">Дата</th>
                    {visibleMetrics.map((m) => (
                      <th key={m.id} className="px-1.5 py-1.5 text-right">
                        <div className="truncate">{m.label}</div>
                        {m.unit ? <div className="text-[9px] normal-case text-muted-foreground">{m.unit}</div> : null}
                      </th>
                    ))}
                    <th className="px-1.5 py-1.5 text-left">Коментар</th>
                    <th className="px-1.5 py-1.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[...filteredLog]
                    .sort((a, b) => b.day_date.localeCompare(a.day_date))
                    .map((row) => (
                      <CompactLogRow key={row.id} row={row} metrics={visibleMetrics} funnelId={funnel.id} projectId={projectId} />
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function MetricMiniChart({
  label,
  unit,
  series,
  total,
  peak,
}: {
  label: string
  unit: string | null
  series: { day: string; value: number }[]
  total: number
  peak: number
}) {
  const W = 200
  const H = 50
  const padX = 4
  const padY = 4
  const maxV = peak > 0 ? peak : 1
  const stepX = series.length > 1 ? (W - padX * 2) / (series.length - 1) : 0
  const points = series.map((d, i) => {
    const x = padX + i * stepX
    const y = padY + (H - padY * 2) * (1 - d.value / maxV)
    return { x, y }
  })
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  return (
    <div className="rounded-md border bg-card/40 p-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="truncate text-xs font-medium">{label}</div>
        <div className="shrink-0 text-sm font-semibold">
          {fmt(total)}
          {unit ? <span className="ml-0.5 text-[10px] text-muted-foreground">{unit}</span> : null}
        </div>
      </div>
      {series.length === 0 ? (
        <div className="flex h-[50px] items-center justify-center text-[10px] text-muted-foreground">немає даних</div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-1 w-full">
          <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} className="text-foreground/70" />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={1.5} className="fill-foreground" />
          ))}
        </svg>
      )}
      <div className="mt-0.5 text-[10px] text-muted-foreground">
        Пік: {fmt(peak)}
        {unit ? ` ${unit}` : ''}
      </div>
    </div>
  )
}

function CompactLogRow({
  row,
  metrics,
  funnelId,
  projectId,
}: {
  row: FunnelDailyLog
  metrics: FunnelMetric[]
  funnelId: string
  projectId: string
}) {
  const [, startTransition] = useTransition()
  return (
    <tr className="hover:bg-muted/10">
      <td className="sticky left-0 z-10 whitespace-nowrap bg-background px-1.5 py-0.5 text-[11px] font-medium">
        {new Date(row.day_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
        <span className="ml-1 text-muted-foreground">{dayOfWeek(row.day_date)}</span>
      </td>
      {metrics.map((m) => (
        <td key={m.id} className="px-1 py-0.5">
          <Input
            type="number"
            step="any"
            defaultValue={row.values?.[m.key] ?? ''}
            onBlur={(e) => {
              const newV = Number(e.target.value) || 0
              const oldV = Number(row.values?.[m.key] ?? 0)
              if (newV !== oldV) {
                const nextValues = { ...(row.values ?? {}) }
                if (newV === 0) delete nextValues[m.key]
                else nextValues[m.key] = newV
                startTransition(() => upsertDailyLog(funnelId, projectId, row.day_date, nextValues, row.comment))
              }
            }}
            className="h-6 w-16 px-1 text-right text-[11px]"
          />
        </td>
      ))}
      <td className="px-1 py-0.5">
        <Input
          defaultValue={row.comment ?? ''}
          onBlur={(e) => {
            const v = e.target.value
            if (v !== (row.comment ?? '')) startTransition(() => upsertDailyLog(funnelId, projectId, row.day_date, row.values ?? {}, v || null))
          }}
          className="h-6 min-w-[80px] text-[11px]"
        />
      </td>
      <td className="px-1 py-0.5 text-right">
        <button
          type="button"
          onClick={() => {
            if (confirm('Видалити рядок?')) startTransition(() => deleteLogRow(row.id, projectId))
          }}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </td>
    </tr>
  )
}

function LogRow({
  row,
  metrics,
  funnelId,
  projectId,
}: {
  row: FunnelDailyLog
  metrics: FunnelMetric[]
  funnelId: string
  projectId: string
}) {
  const [, startTransition] = useTransition()
  return (
    <tr className="hover:bg-muted/10">
      <td className="px-2 py-1 text-xs">{new Date(row.day_date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}</td>
      <td className="px-2 py-1 text-xs text-muted-foreground">{dayOfWeek(row.day_date)}</td>
      {metrics.map((m) => (
        <td key={m.id} className="px-2 py-1">
          <Input
            type="number"
            step="any"
            defaultValue={row.values?.[m.key] ?? ''}
            onBlur={(e) => {
              const newV = Number(e.target.value) || 0
              const oldV = Number(row.values?.[m.key] ?? 0)
              if (newV !== oldV) {
                const nextValues = { ...(row.values ?? {}) }
                if (newV === 0) delete nextValues[m.key]
                else nextValues[m.key] = newV
                startTransition(() => upsertDailyLog(funnelId, projectId, row.day_date, nextValues, row.comment))
              }
            }}
            className="h-7 text-right text-xs"
          />
        </td>
      ))}
      <td className="px-2 py-1">
        <Input
          defaultValue={row.comment ?? ''}
          onBlur={(e) => {
            const v = e.target.value
            if (v !== (row.comment ?? '')) startTransition(() => upsertDailyLog(funnelId, projectId, row.day_date, row.values ?? {}, v || null))
          }}
          className="h-7 text-xs"
        />
      </td>
      <td className="px-2 py-1 text-right">
        <button
          type="button"
          onClick={() => {
            if (confirm('Видалити рядок?')) startTransition(() => deleteLogRow(row.id, projectId))
          }}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}

// Блок D — Рефлексія (показується в попапі) -----------------
function BlockD({ projectId, tracker }: { projectId: string; tracker: MonthlyTracker }) {
  const [, startTransition] = useTransition()
  return (
    <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs">NPS (0–10)</Label>
            <Input
              type="number"
              min={0}
              max={10}
              defaultValue={tracker.nps ?? ''}
              onBlur={(e) => {
                const v = e.target.value === '' ? null : Number(e.target.value)
                startTransition(() => updateTrackerField(tracker.id, projectId, 'nps', v))
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Запуск в строк</Label>
            <select
              defaultValue={tracker.launch_status ?? ''}
              onChange={(e) =>
                startTransition(() => updateTrackerField(tracker.id, projectId, 'launch_status', e.target.value || null))
              }
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— не вказано —</option>
              {(['on_time', 'partial', 'failed'] as LaunchStatus[]).map((s) => (
                <option key={s} value={s}>{LAUNCH_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Як експерт себе відчуває</Label>
          <Textarea
            rows={3}
            defaultValue={tracker.expert_mood ?? ''}
            onBlur={(e) => startTransition(() => updateTrackerField(tracker.id, projectId, 'expert_mood', e.target.value))}
          />
        </div>
    </div>
  )
}
