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
  deleteStage,
  setFunnelProducts,
  setWeeklyPlan,
  updateFunnel,
  updateMetric,
  updateTrackerField,
  upsertDailyLog,
} from './actions'

type FullFunnel = Funnel & {
  mini_prices: FunnelMiniPrice[]
  metrics: FunnelMetric[]
  log: FunnelDailyLog[]
  product_ids: string[]
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
  const total = daysInMonth(y, m)
  const w: { idx: number; start: number; end: number }[] = []
  for (let i = 0; i < 5; i++) {
    const start = i * 7 + 1
    if (start > total) break
    const end = Math.min(start + 6, total)
    w.push({ idx: i + 1, start, end: i === 4 ? total : end })
  }
  return w
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
function metricFact(m: FunnelMetric, log: FunnelDailyLog[]): number {
  // Для computed-метрик факт = сумма фактов входящих ключей
  if (m.computed_from && m.computed_from.length > 0) {
    return m.computed_from.reduce((s, k) => s + sumMetric(log, k), 0)
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
      <BlockD projectId={projectId} tracker={tracker} />
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

        <div>
          <div className="mb-2 text-xs text-muted-foreground">Cash flow по тижнях</div>
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
                {weeks.map((w) => {
                  const fact = factByWeek.get(w.idx) ?? 0
                  const plan = planByWeek.get(w.idx) ?? 0
                  const wpct = plan > 0 ? Math.round((fact / plan) * 100) : 0
                  const status = plan === 0 ? '—' : wpct >= 85 ? '🟢 в плані' : wpct >= 70 ? '🟡 нижче плану' : '🔴 критично'
                  return (
                    <tr key={w.idx} className="hover:bg-muted/20">
                      <td className="px-3 py-2">
                        Тиждень {w.idx} ({w.start}–{w.end})
                      </td>
                      <td className="px-3 py-2 text-right">
                        <WeeklyPlanInput trackerId={tracker.id} projectId={projectId} weekIndex={w.idx} defaultValue={plan} />
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{fmt(fact)}</td>
                      <td className="px-3 py-2 text-right">{plan > 0 ? `${wpct}%` : '—'}</td>
                      <td className="px-3 py-2 text-center text-xs">{status}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
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
              <FunnelDetail funnel={openFunnel} projectId={projectId} products={products} year={tracker.year} month={tracker.month} />
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
    for (const m of funnel.metrics) {
      const fact = m.computed_from?.length
        ? m.computed_from.reduce((s, k) => s + sumMetric(funnel.log, k), 0)
        : sumMetric(funnel.log, m.key)
      if (m.role === 'revenue') agg.revenue += fact
      else if (m.role === 'sales' && m.stage_group?.startsWith('payment')) agg.sales += fact
      else if (m.role === 'applications') agg.applications += fact
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
  year,
  month,
}: {
  funnel: FullFunnel
  projectId: string
  products: Product[]
  year: number
  month: number
}) {
  return (
    <div className="space-y-5">
      <FunnelSettings funnel={funnel} projectId={projectId} products={products} />
      <DerivedStats funnel={funnel} />
      <FunnelStages funnel={funnel} projectId={projectId} />
      <FunnelLog funnel={funnel} projectId={projectId} year={year} month={month} />
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
  const stages = groupedByStage(funnel.metrics)

  const hasTraffic = stages.some((s) => s.stage_group === 'traffic')
  const existingTrafficKeys = new Set(
    funnel.metrics.filter((m) => m.stage_group === 'traffic').map((m) => m.key.replace('traffic__', '')),
  )
  const trafficLeft = TRAFFIC_FIELDS.filter((f) => !existingTrafficKeys.has(f.key))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Етапи воронки</div>
        <Button size="sm" variant="outline" onClick={() => setLibOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Додати етап з бібліотеки
        </Button>
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
            <StageMetricsTable metrics={stages.find((s) => s.stage_group === 'traffic')!.metrics} log={funnel.log} projectId={projectId} />
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
              <StageMetricsTable metrics={s.metrics} log={funnel.log} projectId={projectId} />
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
}: {
  metrics: FunnelMetric[]
  log: FunnelDailyLog[]
  projectId: string
}) {
  const [, startTransition] = useTransition()
  return (
    <div className="overflow-hidden rounded-md border bg-background">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5 text-left">Метрика</th>
            <th className="px-3 py-1.5 text-left">Од.</th>
            <th className="px-3 py-1.5 text-right">План</th>
            <th className="px-3 py-1.5 text-right">Факт</th>
            <th className="px-3 py-1.5 text-right">%</th>
            <th className="px-3 py-1.5"></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {metrics.map((m) => {
            const fact = metricFact(m, log)
            const pct = m.plan_value > 0 ? Math.round((fact / Number(m.plan_value)) * 100) : 0
            const isComputed = Boolean(m.computed_from && m.computed_from.length > 0)
            return (
              <tr key={m.id} className="hover:bg-muted/10">
                <td className="px-3 py-1">
                  <span className="text-sm">{m.label}</span>
                  {isComputed ? <Badge variant="secondary" className="ml-2 text-[10px]">авто</Badge> : null}
                </td>
                <td className="px-3 py-1 text-xs text-muted-foreground">{m.unit ?? '—'}</td>
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
                <td className="px-3 py-1 text-right font-medium">{fmt(fact)}</td>
                <td className="px-3 py-1 text-right text-xs text-muted-foreground">
                  {m.plan_value > 0 ? `${pct}%` : '—'}
                </td>
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
}: {
  funnel: FullFunnel
  projectId: string
  year: number
  month: number
}) {
  const [addOpen, setAddOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const editableMetrics = funnel.metrics.filter((m) => !(m.computed_from && m.computed_from.length > 0))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Журнал по днях</div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={editableMetrics.length === 0} onClick={() => setHistoryOpen(true)}>
            Історія ({funnel.log.length})
          </Button>
          <Button size="sm" disabled={editableMetrics.length === 0} onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Внести дані за день
          </Button>
        </div>
      </div>

      {editableMetrics.length === 0 ? (
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
  open,
  onOpenChange,
}: {
  funnel: FullFunnel
  projectId: string
  year: number
  month: number
  editableMetrics: FunnelMetric[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [, startTransition] = useTransition()
  const [day, setDay] = useState(dayIso(year, month, new Date().getUTCDate()))
  const [values, setValues] = useState<Record<string, string>>({})
  const [comment, setComment] = useState('')

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
  }, [day, existing, editableMetrics])

  const submit = () => {
    const vals: Record<string, number> = {}
    for (const m of editableMetrics) {
      const v = Number(values[m.key])
      if (Number.isFinite(v) && v !== 0) vals[m.key] = v
    }
    startTransition(async () => {
      await upsertDailyLog(funnel.id, projectId, day, vals, comment || null)
      onOpenChange(false)
    })
  }

  // Групуємо за етапами для зручності
  const grouped = groupedByStage(editableMetrics)

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
  const [preset, setPreset] = useState<RangePreset>('month')
  const [customFrom, setCustomFrom] = useState<string>(todayIso)
  const [customTo, setCustomTo] = useState<string>(todayIso)
  const [selectedMetric, setSelectedMetric] = useState<string>(editableMetrics[0]?.key ?? '')

  // Обчислюємо діапазон
  const { from, to } = useMemo(() => {
    if (preset === 'all') return { from: '0000-01-01', to: '9999-12-31' }
    if (preset === 'custom') return { from: customFrom, to: customTo }
    const d = new Date()
    if (preset === 'week') {
      const start = new Date(d)
      start.setUTCDate(d.getUTCDate() - 6)
      return { from: start.toISOString().slice(0, 10), to: d.toISOString().slice(0, 10) }
    }
    // month
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

  // Дані для графіка: серія {day_date, value} вибраної метрики
  const selM = editableMetrics.find((m) => m.key === selectedMetric)
  const series = useMemo(() => {
    if (!selM) return [] as { day: string; value: number }[]
    return [...filteredLog]
      .sort((a, b) => a.day_date.localeCompare(b.day_date))
      .map((r) => ({ day: r.day_date, value: Number(r.values?.[selM.key]) || 0 }))
  }, [filteredLog, selM])
  const total = series.reduce((s, p) => s + p.value, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
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
          <span className="ml-auto text-xs text-muted-foreground">
            {filteredLog.length} записів
          </span>
        </div>

        {/* Автоматичні розрахунки за період */}
        {derived.length > 0 ? (
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
        ) : null}

        {/* Графік однієї метрики */}
        {editableMetrics.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">Графік по днях</div>
              <select
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              >
                {editableMetrics.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>
            {series.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">Немає даних за період</p>
            ) : (
              <LineChart data={series} label={selM?.label ?? ''} unit={selM?.unit ?? ''} />
            )}
            <div className="text-xs text-muted-foreground">
              Сума за період: <strong className="text-foreground">{fmt(total)}</strong>
              {selM?.unit ? ` ${selM.unit}` : null}
            </div>
          </div>
        ) : null}

        {/* Таблиця по днях (read-only inline edit) */}
        {filteredLog.length > 0 ? (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Дата</th>
                  <th className="px-2 py-2 text-left">День</th>
                  {editableMetrics.map((m) => (
                    <th key={m.id} className="px-2 py-2 text-right">
                      {m.label}
                      {m.unit ? <span className="ml-1 text-[10px] text-muted-foreground">({m.unit})</span> : null}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-left">Коментар</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {[...filteredLog]
                  .sort((a, b) => b.day_date.localeCompare(a.day_date))
                  .map((row) => (
                    <LogRow key={row.id} row={row} metrics={editableMetrics} funnelId={funnel.id} projectId={projectId} />
                  ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function LineChart({ data, label, unit }: { data: { day: string; value: number }[]; label: string; unit: string }) {
  if (data.length === 0) return null
  const W = 600
  const H = 140
  const padX = 28
  const padY = 12
  const maxV = Math.max(...data.map((d) => d.value), 1)
  const stepX = data.length > 1 ? (W - padX * 2) / (data.length - 1) : 0
  const points = data.map((d, i) => {
    const x = padX + i * stepX
    const y = padY + (H - padY * 2) * (1 - d.value / maxV)
    return { x, y, v: d.value, day: d.day }
  })
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')

  return (
    <div className="overflow-x-auto rounded-md border bg-card/40 p-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <title>{label}</title>
        {/* baseline */}
        <line x1={padX} y1={H - padY} x2={W - padX} y2={H - padY} stroke="currentColor" className="text-muted-foreground/30" />
        {/* max line */}
        <line x1={padX} y1={padY} x2={W - padX} y2={padY} stroke="currentColor" className="text-muted-foreground/10" strokeDasharray="3 3" />
        <text x={padX} y={padY - 2} className="fill-muted-foreground text-[10px]">{maxV.toLocaleString('ru-RU')}{unit ? ` ${unit}` : ''}</text>
        <path d={path} fill="none" stroke="currentColor" strokeWidth={2} className="text-foreground/80" />
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3} className="fill-foreground" />
            {/* x label every Nth */}
            {i === 0 || i === points.length - 1 || (points.length > 4 && i === Math.floor(points.length / 2)) ? (
              <text x={p.x} y={H - 2} textAnchor="middle" className="fill-muted-foreground text-[9px]">
                {new Date(p.day).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </div>
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

// Блок D ----------------------------------------------------
function BlockD({ projectId, tracker }: { projectId: string; tracker: MonthlyTracker }) {
  const [, startTransition] = useTransition()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Якість роботи з експертом</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
      </CardContent>
    </Card>
  )
}
