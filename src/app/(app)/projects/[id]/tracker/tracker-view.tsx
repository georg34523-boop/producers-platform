'use client'

import { useState, useTransition } from 'react'
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
import { LAUNCH_STATUS_LABEL, MONTH_LABEL_RU, STAGE_KIND_LABEL } from '@/lib/labels'
import type {
  Funnel,
  FunnelSale,
  FunnelStage,
  FunnelStageDailyLog,
  FunnelTrafficDaily,
  LaunchStatus,
  MonthlyTracker,
  Product,
  StageKind,
  TrackerWeeklyPlan,
} from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

import {
  addSale,
  addStage,
  createFunnel,
  deleteFunnel,
  deleteSale,
  deleteStage,
  setStageDailyAmount,
  setTrafficDaily,
  setWeeklyPlan,
  updateFunnel,
  updateStage,
  updateTrackerField,
} from './actions'

type FullFunnel = Funnel & {
  product_ids: string[]
  stages: (FunnelStage & { logs: FunnelStageDailyLog[] })[]
  sales: FunnelSale[]
  traffic: FunnelTrafficDaily[]
}

// ------------------------------------------------------------
// Утилиты
// ------------------------------------------------------------
function fmt(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })
}
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}
function pad(n: number): string {
  return String(n).padStart(2, '0')
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
    w.push({ idx: i + 1, start, end: i === 3 && total > 28 ? total : end })
  }
  // Если месяц длиннее 28 дней — пятой неделей доберём остаток
  if (total > 28 && w.length === 4) {
    w.push({ idx: 5, start: 29, end: total })
    w[3].end = 28
  }
  return w
}

// ------------------------------------------------------------
// Орхестратор
// ------------------------------------------------------------
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
      <BlockB projectId={projectId} tracker={tracker} funnels={funnels} products={products} />
      <BlockC projectId={projectId} tracker={tracker} funnels={funnels} />
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
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link href={`/projects/${projectId}/tracker?ym=${ym(prev)}`} />}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-lg font-semibold">
          {MONTH_LABEL_RU[tracker.month]} {tracker.year}
        </h2>
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link href={`/projects/${projectId}/tracker?ym=${ym(next)}`} />}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Badge variant={tracker.status === 'closed' ? 'secondary' : 'default'}>
          {tracker.status === 'closed' ? 'Закрыт' : 'Открыт'}
        </Badge>
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Блок A: цели и прогресс
// ------------------------------------------------------------
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

  const allSales = funnels.flatMap((f) => f.sales)
  const factByWeek = new Map<number, number>()
  for (const s of allSales) {
    const d = new Date(s.day_date + 'T00:00:00Z')
    const day = d.getUTCDate()
    const wk = weeks.find((w) => day >= w.start && day <= w.end)
    if (!wk) continue
    factByWeek.set(wk.idx, (factByWeek.get(wk.idx) ?? 0) + Number(s.unit_price) * s.qty)
  }
  const totalFact = [...factByWeek.values()].reduce((s, x) => s + x, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">A. Цели выручки</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <PlanField label="Минимум" trackerId={tracker.id} projectId={projectId} field="revenue_plan_min" defaultValue={Number(tracker.revenue_plan_min)} />
          <PlanField label="Средний" trackerId={tracker.id} projectId={projectId} field="revenue_plan_avg" defaultValue={Number(tracker.revenue_plan_avg)} highlight />
          <PlanField label="Максимум" trackerId={tracker.id} projectId={projectId} field="revenue_plan_max" defaultValue={Number(tracker.revenue_plan_max)} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <PlanField label="План продаж, шт" trackerId={tracker.id} projectId={projectId} field="sales_plan" defaultValue={Number(tracker.sales_plan)} />
          <PlanField label="План анкет, шт" trackerId={tracker.id} projectId={projectId} field="applications_plan" defaultValue={Number(tracker.applications_plan)} />
          <PlanField label="План среднего чека, $" trackerId={tracker.id} projectId={projectId} field="avg_check_plan" defaultValue={Number(tracker.avg_check_plan)} />
        </div>

        <div>
          <div className="mb-2 text-xs text-muted-foreground">Распределение среднего плана по неделям</div>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))` }}>
            {weeks.map((w) => {
              const fact = factByWeek.get(w.idx) ?? 0
              const plan = planByWeek.get(w.idx) ?? 0
              const pct = plan > 0 ? Math.round((fact / plan) * 100) : 0
              return (
                <div key={w.idx} className="rounded-md border bg-card/40 p-2 text-xs">
                  <div className="text-muted-foreground">
                    Неделя {w.idx} ({w.start}–{w.end})
                  </div>
                  <WeeklyPlanInput trackerId={tracker.id} projectId={projectId} weekIndex={w.idx} defaultValue={plan} />
                  <div className="mt-1 text-foreground">
                    Факт: <strong>{fmt(fact)}</strong>
                    {plan > 0 ? <span className="ml-1 text-muted-foreground">{pct}%</span> : null}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          Итого факт месяца: <strong>{fmt(totalFact)}</strong> /{' '}
          {fmt(Number(tracker.revenue_plan_avg))} (среднего плана){' '}
          {Number(tracker.revenue_plan_avg) > 0 ? (
            <span className="text-muted-foreground">
              · {Math.round((totalFact / Number(tracker.revenue_plan_avg)) * 100)}%
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

function PlanField({
  label,
  trackerId,
  projectId,
  field,
  defaultValue,
  highlight,
}: {
  label: string
  trackerId: string
  projectId: string
  field: string
  defaultValue: number
  highlight?: boolean
}) {
  const [, startTransition] = useTransition()
  return (
    <div className={cn('space-y-1', highlight && 'rounded-md bg-muted/30 p-2')}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        step="any"
        defaultValue={defaultValue}
        onBlur={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v) && v !== defaultValue) {
            startTransition(() => updateTrackerField(trackerId, projectId, field, v))
          }
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
      placeholder="План"
      className="h-7 mt-1 text-xs"
      onBlur={(e) => {
        const v = Number(e.target.value)
        if (Number.isFinite(v) && v !== defaultValue) {
          startTransition(() => setWeeklyPlan(trackerId, projectId, weekIndex, v))
        }
      }}
    />
  )
}

// ------------------------------------------------------------
// Блок B: воронки
// ------------------------------------------------------------
function BlockB({
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
  const [newOpen, setNewOpen] = useState(false)
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">B. Воронки</CardTitle>
        <Button size="sm" variant="outline" onClick={() => setNewOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Воронка
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {funnels.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Воронок ещё нет. Добавь — например «Вебинар-запуск».
          </p>
        ) : (
          funnels.map((f) => (
            <FunnelCard
              key={f.id}
              funnel={f}
              projectId={projectId}
              year={tracker.year}
              month={tracker.month}
              products={products}
            />
          ))
        )}
      </CardContent>

      <NewFunnelDialog
        trackerId={tracker.id}
        projectId={projectId}
        products={products}
        open={newOpen}
        onOpenChange={setNewOpen}
      />
    </Card>
  )
}

function NewFunnelDialog({
  trackerId,
  projectId,
  products,
  open,
  onOpenChange,
}: {
  trackerId: string
  projectId: string
  products: Product[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [isMini, setIsMini] = useState(false)
  const [productIds, setProductIds] = useState<Set<string>>(new Set())

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новая воронка</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Название</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Вебинар-запуск / Отдел продаж / Tripwire…" autoFocus />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isMini} onChange={(e) => setIsMini(e.target.checked)} />
            Мини-продукт (трипвайр) — для модели 70/30
          </label>
          <div className="space-y-1">
            <Label>На какие продукты ведёт</Label>
            {products.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                У проекта пока нет продуктов. Заведи их на вкладке «Продукты», потом сюда вернись.
              </p>
            ) : (
              <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                {products.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={productIds.has(p.id)}
                      onChange={(e) => {
                        const next = new Set(productIds)
                        if (e.target.checked) next.add(p.id)
                        else next.delete(p.id)
                        setProductIds(next)
                      }}
                    />
                    {p.name}
                    <span className="text-xs text-muted-foreground"> — {fmt(Number(p.current_price))} $</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Отмена</Button>
          <Button
            disabled={!name.trim()}
            onClick={() => {
              startTransition(async () => {
                await createFunnel({
                  tracker_id: trackerId,
                  project_id: projectId,
                  name: name.trim(),
                  is_mini_product: isMini,
                  product_ids: [...productIds],
                })
                setName('')
                setIsMini(false)
                setProductIds(new Set())
                onOpenChange(false)
              })
            }}
          >
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FunnelCard({
  funnel,
  projectId,
  year,
  month,
  products,
}: {
  funnel: FullFunnel
  projectId: string
  year: number
  month: number
  products: Product[]
}) {
  const [, startTransition] = useTransition()
  const [tab, setTab] = useState<'stages' | 'sales' | 'traffic'>('stages')
  const revenue = funnel.sales.reduce((s, x) => s + Number(x.unit_price) * x.qty, 0)
  const traffic = funnel.traffic.reduce((s, x) => s + Number(x.amount), 0)
  const linkedProducts = products.filter((p) => funnel.product_ids.includes(p.id))

  return (
    <div className="rounded-md border bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Input
            className="h-8 max-w-xs text-sm font-medium"
            defaultValue={funnel.name}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== funnel.name) startTransition(() => updateFunnel(funnel.id, projectId, { name: v }))
            }}
          />
          {funnel.is_mini_product ? <Badge variant="secondary">Мини-продукт</Badge> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1 text-xs">
          <span className="text-muted-foreground">Выручка:</span>
          <strong>{fmt(revenue)}</strong>
          <span className="ml-2 text-muted-foreground">Трафик:</span>
          <strong>{fmt(traffic)}</strong>
          <Button
            size="icon-sm"
            variant="ghost"
            className="ml-2"
            onClick={() => {
              if (confirm('Удалить воронку?')) startTransition(() => deleteFunnel(funnel.id, projectId))
            }}
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>

      <div className="mb-2 text-xs text-muted-foreground">
        Продукты:{' '}
        {linkedProducts.length === 0 ? (
          <span className="italic">не привязаны</span>
        ) : (
          linkedProducts.map((p) => p.name).join(', ')
        )}
      </div>

      <div className="mb-2 flex gap-1 border-b">
        {(['stages', 'sales', 'traffic'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'border-b-2 px-3 py-1 text-xs',
              tab === t ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t === 'stages' ? 'Этапы' : t === 'sales' ? 'Продажи' : 'Трафик'}
          </button>
        ))}
      </div>

      {tab === 'stages' ? (
        <StagesPanel funnel={funnel} projectId={projectId} year={year} month={month} />
      ) : tab === 'sales' ? (
        <SalesPanel funnel={funnel} projectId={projectId} year={year} month={month} products={linkedProducts.length > 0 ? linkedProducts : products} />
      ) : (
        <TrafficPanel funnel={funnel} projectId={projectId} year={year} month={month} />
      )}
    </div>
  )
}

function StagesPanel({
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
  const [newStage, setNewStage] = useState<{ name: string; kind: StageKind; plan: string }>({
    name: '',
    kind: 'intermediate',
    plan: '',
  })
  const [, startTransition] = useTransition()
  const [openStageId, setOpenStageId] = useState<string | null>(null)

  return (
    <div className="space-y-2">
      {funnel.stages.map((s, i) => {
        const total = s.logs.reduce((acc, l) => acc + Number(l.amount), 0)
        const pct = s.plan_value > 0 ? Math.round((total / s.plan_value) * 100) : 0
        const prev = funnel.stages[i - 1]
        const prevTotal = prev ? prev.logs.reduce((acc, l) => acc + Number(l.amount), 0) : null
        const conv = prevTotal && prevTotal > 0 ? Math.round((total / prevTotal) * 100) : null
        const isOpen = openStageId === s.id
        return (
          <div key={s.id} className="rounded-md border bg-background">
            <button
              type="button"
              onClick={() => setOpenStageId(isOpen ? null : s.id)}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{s.name}</span>
                <Badge variant="secondary" className="text-[10px]">{STAGE_KIND_LABEL[s.kind]}</Badge>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span>
                  <strong>{fmt(total)}</strong> / {fmt(Number(s.plan_value))} ({pct}%)
                </span>
                {conv !== null ? <span className="text-muted-foreground">конв. {conv}%</span> : null}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (confirm('Удалить этап?')) startTransition(() => deleteStage(s.id, projectId))
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </button>
            {isOpen ? (
              <StageEdit
                stage={s}
                projectId={projectId}
                year={year}
                month={month}
              />
            ) : null}
          </div>
        )
      })}

      {addOpen ? (
        <div className="grid gap-2 rounded-md border bg-background p-2 sm:grid-cols-[1fr_120px_120px_auto]">
          <Input
            value={newStage.name}
            onChange={(e) => setNewStage((p) => ({ ...p, name: e.target.value }))}
            placeholder="Название этапа"
          />
          <select
            value={newStage.kind}
            onChange={(e) => setNewStage((p) => ({ ...p, kind: e.target.value as StageKind }))}
            className="flex h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            <option value="application">Анкета</option>
            <option value="intermediate">Промежуточный</option>
            <option value="payment">Оплаты</option>
          </select>
          <Input
            type="number"
            value={newStage.plan}
            onChange={(e) => setNewStage((p) => ({ ...p, plan: e.target.value }))}
            placeholder="План"
          />
          <Button
            size="sm"
            onClick={() => {
              if (!newStage.name.trim()) return
              startTransition(async () => {
                await addStage(funnel.id, projectId, newStage.name.trim(), newStage.kind, Number(newStage.plan) || 0)
                setNewStage({ name: '', kind: 'intermediate', plan: '' })
                setAddOpen(false)
              })
            }}
          >
            Добавить
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setAddOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Этап
        </Button>
      )}
    </div>
  )
}

function StageEdit({
  stage,
  projectId,
  year,
  month,
}: {
  stage: FunnelStage & { logs: FunnelStageDailyLog[] }
  projectId: string
  year: number
  month: number
}) {
  const [, startTransition] = useTransition()
  return (
    <div className="border-t bg-card/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
        <span className="text-muted-foreground">Изменить:</span>
        <Input
          defaultValue={stage.name}
          className="h-7 max-w-[200px]"
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v && v !== stage.name) startTransition(() => updateStage(stage.id, projectId, { name: v }))
          }}
        />
        <select
          defaultValue={stage.kind}
          onChange={(e) =>
            startTransition(() => updateStage(stage.id, projectId, { kind: e.target.value as StageKind }))
          }
          className="h-7 rounded-md border border-input bg-background px-2 text-xs"
        >
          <option value="application">Анкета</option>
          <option value="intermediate">Промежуточный</option>
          <option value="payment">Оплаты</option>
        </select>
        <span className="text-muted-foreground">План:</span>
        <Input
          type="number"
          defaultValue={stage.plan_value}
          className="h-7 max-w-[120px]"
          onBlur={(e) => {
            const v = Number(e.target.value)
            if (Number.isFinite(v) && v !== stage.plan_value)
              startTransition(() => updateStage(stage.id, projectId, { plan_value: v }))
          }}
        />
      </div>
      <div className="mb-1 text-xs text-muted-foreground">Дневной факт:</div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1).map((d) => {
          const day = dayIso(year, month, d)
          const entry = stage.logs.find((l) => l.day_date === day)
          return (
            <DailyCell
              key={day}
              day={d}
              defaultValue={entry?.amount ?? 0}
              onCommit={(v) => setStageDailyAmount(stage.id, projectId, day, v)}
            />
          )
        })}
      </div>
    </div>
  )
}

function DailyCell({
  day,
  defaultValue,
  onCommit,
}: {
  day: number
  defaultValue: number
  onCommit: (v: number) => Promise<void>
}) {
  const [, startTransition] = useTransition()
  return (
    <label className="flex flex-col gap-0.5 text-[10px]">
      <span className="text-muted-foreground">{day}</span>
      <Input
        type="number"
        step="any"
        defaultValue={defaultValue || ''}
        className="h-7 px-1 text-xs"
        onBlur={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v) && v !== Number(defaultValue)) {
            startTransition(() => {
              void onCommit(v)
            })
          }
        }}
      />
    </label>
  )
}

function SalesPanel({
  funnel,
  projectId,
  year,
  month,
  products,
}: {
  funnel: FullFunnel
  projectId: string
  year: number
  month: number
  products: Product[]
}) {
  const [, startTransition] = useTransition()
  const [day, setDay] = useState<string>(dayIso(year, month, new Date().getUTCDate()))
  const [productId, setProductId] = useState<string>(products[0]?.id ?? '')
  const [qty, setQty] = useState('1')
  const [price, setPrice] = useState<string>(String(products[0]?.current_price ?? ''))

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[140px_1fr_100px_140px_auto]">
        <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-9" />
        <select
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value)
            const p = products.find((x) => x.id === e.target.value)
            if (p) setPrice(String(p.current_price))
          }}
          className="flex h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">— продукт —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="Кол-во" />
        <Input type="number" step="any" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Цена за ед." />
        <Button
          size="sm"
          disabled={!productId || Number(qty) <= 0}
          onClick={() => {
            startTransition(async () => {
              await addSale({
                funnel_id: funnel.id,
                project_id: projectId,
                product_id: productId,
                day_date: day,
                qty: Math.max(1, Math.floor(Number(qty))),
                unit_price: Number(price) || 0,
              })
              setQty('1')
            })
          }}
        >
          + Продажа
        </Button>
      </div>

      <div className="rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left">Дата</th>
              <th className="px-2 py-1.5 text-left">Продукт</th>
              <th className="px-2 py-1.5 text-right">Кол-во</th>
              <th className="px-2 py-1.5 text-right">Цена</th>
              <th className="px-2 py-1.5 text-right">Сумма</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {funnel.sales.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-4 text-center text-muted-foreground">Продаж нет</td>
              </tr>
            ) : (
              [...funnel.sales]
                .sort((a, b) => b.day_date.localeCompare(a.day_date))
                .map((s) => {
                  const p = products.find((x) => x.id === s.product_id)
                  return (
                    <tr key={s.id} className="hover:bg-muted/20">
                      <td className="px-2 py-1">{new Date(s.day_date).toLocaleDateString('ru-RU')}</td>
                      <td className="px-2 py-1">{p?.name ?? '—'}</td>
                      <td className="px-2 py-1 text-right">{s.qty}</td>
                      <td className="px-2 py-1 text-right">{fmt(Number(s.unit_price))}</td>
                      <td className="px-2 py-1 text-right font-medium">{fmt(Number(s.unit_price) * s.qty)}</td>
                      <td className="px-2 py-1 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm('Удалить продажу?'))
                              startTransition(() => deleteSale(s.id, projectId))
                          }}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  )
                })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TrafficPanel({
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
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">Дневной расход на трафик:</div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1).map((d) => {
          const day = dayIso(year, month, d)
          const entry = funnel.traffic.find((l) => l.day_date === day)
          return (
            <DailyCell
              key={day}
              day={d}
              defaultValue={Number(entry?.amount ?? 0)}
              onCommit={(v) => setTrafficDaily(funnel.id, projectId, day, v)}
            />
          )
        })}
      </div>
    </div>
  )
}

// ------------------------------------------------------------
// Блок C: трафик on/off (per-funnel ввод — в Блоке B)
// ------------------------------------------------------------
function BlockC({
  projectId,
  tracker,
  funnels,
}: {
  projectId: string
  tracker: MonthlyTracker
  funnels: FullFunnel[]
}) {
  const [, startTransition] = useTransition()
  const spend = funnels.reduce((s, f) => s + f.traffic.reduce((ss, x) => ss + Number(x.amount), 0), 0)
  const apps = funnels
    .flatMap((f) => f.stages)
    .filter((s) => s.kind === 'application')
    .flatMap((s) => s.logs)
    .reduce((s, l) => s + Number(l.amount), 0)
  const revenue = funnels.flatMap((f) => f.sales).reduce((s, x) => s + Number(x.unit_price) * x.qty, 0)
  const cpl = apps > 0 ? Math.round(spend / apps) : 0
  const roas = spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">C. Трафик</CardTitle>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={tracker.traffic_enabled}
            onChange={(e) =>
              startTransition(() => updateTrackerField(tracker.id, projectId, 'traffic_enabled', e.target.checked as unknown as string))
            }
          />
          Платный трафик есть
        </label>
      </CardHeader>
      {tracker.traffic_enabled ? (
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="Расход (сумма по дням)" value={fmt(spend)} />
            <Stat label="Анкет" value={fmt(apps)} />
            <Stat label="CPL" value={fmt(cpl)} />
            <Stat label="ROAS" value={String(roas)} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Дневной ввод трафика — внутри каждой воронки (вкладка «Трафик»).
          </p>
        </CardContent>
      ) : (
        <CardContent className="text-sm text-muted-foreground">
          Если у проекта нет платного трафика — оставь выключенным. Иначе включи и вводи расход внутри воронок.
        </CardContent>
      )}
    </Card>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-card/40 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-base font-medium">{value}</div>
    </div>
  )
}

// ------------------------------------------------------------
// Блок D: качество работы
// ------------------------------------------------------------
function BlockD({ projectId, tracker }: { projectId: string; tracker: MonthlyTracker }) {
  const [, startTransition] = useTransition()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">D. Качество работы с экспертом</CardTitle>
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
            <Label className="text-xs">Запуск в срок</Label>
            <select
              defaultValue={tracker.launch_status ?? ''}
              onChange={(e) =>
                startTransition(() => updateTrackerField(tracker.id, projectId, 'launch_status', e.target.value || null))
              }
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <option value="">— не указано —</option>
              {(['on_time', 'partial', 'failed'] as LaunchStatus[]).map((s) => (
                <option key={s} value={s}>{LAUNCH_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Как эксперт себя чувствует</Label>
          <Textarea
            rows={3}
            defaultValue={tracker.expert_mood ?? ''}
            onBlur={(e) =>
              startTransition(() => updateTrackerField(tracker.id, projectId, 'expert_mood', e.target.value))
            }
          />
        </div>
      </CardContent>
    </Card>
  )
}
