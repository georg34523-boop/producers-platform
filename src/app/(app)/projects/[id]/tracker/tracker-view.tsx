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
  // Возвращает массив { stage_group, label, metrics[] } в порядке position
  const order: string[] = []
  const groups = new Map<string, FunnelMetric[]>()
  for (const m of [...metrics].sort((a, b) => a.position - b.position)) {
    const sg = m.stage_group ?? 'other'
    if (!groups.has(sg)) {
      groups.set(sg, [])
      order.push(sg)
    }
    groups.get(sg)!.push(m)
  }
  return order.map((sg) => {
    // Имя этапа: для variants 'webinar_2' → 'Вебінар #2'
    const base = sg.replace(/_(\d+)$/, '')
    const variant = sg.match(/_(\d+)$/)?.[1]
    const tpl = getStageTemplate(base)
    const label = tpl ? (variant ? `${tpl.label} #${variant}` : tpl.label) : sg
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

// Воронки: табы + детальная панель ---------------------------
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
  const [selectedId, setSelectedId] = useState<string | null>(funnels[0]?.id ?? null)
  const [newOpen, setNewOpen] = useState(false)
  const selected = funnels.find((f) => f.id === selectedId) ?? funnels[0] ?? null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Воронки</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-1 border-b pb-2">
          {funnels.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setSelectedId(f.id)}
              className={cn(
                'rounded-md border px-3 py-1.5 text-sm transition-colors',
                selected?.id === f.id ? 'border-foreground bg-muted' : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {f.name}
              {f.funnel_type ? <span className="ml-1 text-[10px] text-muted-foreground">{FUNNEL_TYPE_LABEL[f.funnel_type as FunnelType] ?? f.funnel_type}</span> : null}
            </button>
          ))}
          <Button size="sm" variant="outline" onClick={() => setNewOpen(true)} className="ml-2">
            <Plus className="mr-1 h-3.5 w-3.5" />
            Воронка
          </Button>
        </div>

        {selected ? (
          <FunnelDetail funnel={selected} projectId={projectId} products={products} year={tracker.year} month={tracker.month} />
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">Додай першу воронку — обери тип, отримаєш рекомендовані етапи.</p>
        )}
      </CardContent>

      <NewFunnelDialog trackerId={tracker.id} projectId={projectId} products={products} open={newOpen} onOpenChange={setNewOpen} onCreated={setSelectedId} />
    </Card>
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
  const [isMini, setIsMini] = useState(false)
  const [productId, setProductId] = useState('')
  const [trafficEnabled, setTrafficEnabled] = useState(true)
  const [channel, setChannel] = useState<string>('')

  const defaults = FUNNEL_DEFAULTS[type]

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

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isMini} onChange={(e) => setIsMini(e.target.checked)} />
            Це чисто мини-продуктова воронка (без основного)
          </label>

          {!isMini ? (
            <div className="space-y-1">
              <Label>Продукт, на який веде</Label>
              <select
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— не привʼязано —</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="rounded-md border bg-muted/20 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={trafficEnabled} onChange={(e) => setTrafficEnabled(e.target.checked)} />
              Є платний трафік
            </label>
            {trafficEnabled ? (
              <div className="mt-2 space-y-1">
                <Label className="text-xs">Канал</Label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 text-xs"
                >
                  <option value="">— не вказано —</option>
                  {TRAFFIC_CHANNELS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Поля трафіку (Витрачено, Покази, Кліки, CR сайту) додаються після створення.
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
                  is_mini_product: isMini,
                  product_id: productId || null,
                  traffic_enabled: trafficEnabled,
                  traffic_channel: channel,
                })
                if (id) onCreated(id)
                setName('')
                setType('webinar')
                setIsMini(false)
                setProductId('')
                setTrafficEnabled(true)
                setChannel('')
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
      <FunnelStages funnel={funnel} projectId={projectId} />
      <FunnelLog funnel={funnel} projectId={projectId} year={year} month={month} />
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

  return (
    <div className="space-y-3 rounded-md border bg-card/40 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
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
        {!funnel.is_mini_product ? (
          <div className="space-y-1">
            <Label className="text-xs">Продукт</Label>
            <select
              defaultValue={funnel.product_id ?? ''}
              onChange={(e) => startTransition(() => updateFunnel(funnel.id, projectId, { product_id: e.target.value || null }))}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— не привʼязано —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        ) : (
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
                <Input value={newPriceName} onChange={(e) => setNewPriceName(e.target.value)} placeholder="Тариф" className="h-7 text-xs" />
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
        )}
      </div>

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
          <>
            <span className="text-xs text-muted-foreground">Канал:</span>
            <select
              defaultValue={funnel.traffic_channel ?? ''}
              onChange={(e) => startTransition(() => updateFunnel(funnel.id, projectId, { traffic_channel: e.target.value || null }))}
              className="h-7 rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">—</option>
              {TRAFFIC_CHANNELS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            defaultChecked={funnel.is_mini_product}
            onChange={(e) => startTransition(() => updateFunnel(funnel.id, projectId, { is_mini_product: e.target.checked }))}
          />
          Чисто мини-продуктова
        </label>
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

// Дневной лог -----------------------------------------------
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
  const [, startTransition] = useTransition()
  // В журнале только редактируемые метрики (не computed)
  const editableMetrics = funnel.metrics.filter((m) => !(m.computed_from && m.computed_from.length > 0))

  const draftInit = useMemo(
    () => ({
      day: dayIso(year, month, new Date().getUTCDate()),
      values: Object.fromEntries(editableMetrics.map((m) => [m.key, ''])) as Record<string, string>,
      comment: '',
    }),
    [editableMetrics, year, month],
  )
  const [draft, setDraft] = useState(draftInit)

  const submitDraft = () => {
    if (editableMetrics.length === 0) return
    const vals: Record<string, number> = {}
    for (const m of editableMetrics) {
      const v = Number(draft.values[m.key])
      if (Number.isFinite(v) && v !== 0) vals[m.key] = v
    }
    startTransition(async () => {
      await upsertDailyLog(funnel.id, projectId, draft.day, vals, draft.comment || null)
      setDraft({ ...draftInit })
    })
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Щоденний журнал</div>
      {editableMetrics.length === 0 ? (
        <p className="text-xs text-muted-foreground">Додай етапи з бібліотеки — і тут зʼявиться журнал.</p>
      ) : (
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
              {funnel.log.map((row) => (
                <LogRow key={row.id} row={row} metrics={editableMetrics} funnelId={funnel.id} projectId={projectId} />
              ))}
              <tr className="bg-muted/20">
                <td className="px-2 py-1">
                  <Input
                    type="date"
                    value={draft.day}
                    onChange={(e) => setDraft((s) => ({ ...s, day: e.target.value }))}
                    className="h-7 text-xs"
                  />
                </td>
                <td className="px-2 py-1 text-xs text-muted-foreground">{dayOfWeek(draft.day)}</td>
                {editableMetrics.map((m) => (
                  <td key={m.id} className="px-2 py-1">
                    <Input
                      type="number"
                      step="any"
                      value={draft.values[m.key] ?? ''}
                      onChange={(e) => setDraft((s) => ({ ...s, values: { ...s.values, [m.key]: e.target.value } }))}
                      className="h-7 text-right text-xs"
                    />
                  </td>
                ))}
                <td className="px-2 py-1">
                  <Input
                    value={draft.comment}
                    onChange={(e) => setDraft((s) => ({ ...s, comment: e.target.value }))}
                    className="h-7 text-xs"
                  />
                </td>
                <td className="px-2 py-1 text-right">
                  <Button size="sm" onClick={submitDraft}>+</Button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
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
