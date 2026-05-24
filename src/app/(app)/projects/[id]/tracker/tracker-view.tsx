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
import { LAUNCH_STATUS_LABEL, MONTH_LABEL_RU } from '@/lib/labels'
import type {
  Funnel,
  FunnelDailyJournal,
  FunnelMiniPrice,
  LaunchStatus,
  MonthlyTracker,
  Product,
  TrackerWeeklyPlan,
} from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

import {
  addMiniPrice,
  createFunnel,
  deleteFunnel,
  deleteJournalRow,
  deleteMiniPrice,
  setWeeklyPlan,
  updateFunnel,
  updateJournalField,
  updateTrackerField,
  upsertJournalRow,
} from './actions'

type FullFunnel = Funnel & {
  mini_prices: FunnelMiniPrice[]
  journal: FunnelDailyJournal[]
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
function ru(date: string): string {
  return new Date(date).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
}
function dayOfWeek(date: string): string {
  const days = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
  return days[new Date(date + 'T00:00:00Z').getUTCDay()]!
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
      <BlockB projectId={projectId} tracker={tracker} funnels={funnels} products={products} />
      <Journal projectId={projectId} tracker={tracker} funnels={funnels} />
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

// Блок A: цели + cash flow по неделям -----------------------
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

  const allRows = funnels.flatMap((f) => f.journal)
  const totalFact = allRows.reduce((s, r) => s + Number(r.revenue), 0)
  const factByWeek = new Map<number, number>()
  for (const r of allRows) {
    const day = new Date(r.day_date + 'T00:00:00Z').getUTCDate()
    const wk = weeks.find((w) => day >= w.start && day <= w.end)
    if (!wk) continue
    factByWeek.set(wk.idx, (factByWeek.get(wk.idx) ?? 0) + Number(r.revenue))
  }

  const remaining = Math.max(0, Number(tracker.revenue_plan_avg) - totalFact)
  const pct = Number(tracker.revenue_plan_avg) > 0
    ? Math.round((totalFact / Number(tracker.revenue_plan_avg)) * 100)
    : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">A. Цели и cash flow</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Позиция к плану */}
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat title="Цель (средняя)" value={fmt(Number(tracker.revenue_plan_avg))} />
          <Stat title="Факт месяца" value={fmt(totalFact)} highlight />
          <Stat title="% виконання" value={`${pct}%`} />
          <Stat title="Залишилось" value={fmt(remaining)} />
        </div>

        {/* Планы */}
        <div className="grid gap-3 sm:grid-cols-3">
          <PlanField label="Мінімум" trackerId={tracker.id} projectId={projectId} field="revenue_plan_min" defaultValue={Number(tracker.revenue_plan_min)} />
          <PlanField label="Середній" trackerId={tracker.id} projectId={projectId} field="revenue_plan_avg" defaultValue={Number(tracker.revenue_plan_avg)} />
          <PlanField label="Максимум" trackerId={tracker.id} projectId={projectId} field="revenue_plan_max" defaultValue={Number(tracker.revenue_plan_max)} />
        </div>

        {/* Cash flow по тижнях */}
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
                  const status =
                    plan === 0 ? '—' : wpct >= 85 ? '🟢 в плані' : wpct >= 70 ? '🟡 нижче плану' : '🔴 критично'
                  return (
                    <tr key={w.idx} className="hover:bg-muted/20">
                      <td className="px-3 py-2">
                        Неділя {w.idx} ({w.start}–{w.end})
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
      className="h-7 ml-auto max-w-[120px] text-right text-sm"
      onBlur={(e) => {
        const v = Number(e.target.value)
        if (Number.isFinite(v) && v !== defaultValue) startTransition(() => setWeeklyPlan(trackerId, projectId, weekIndex, v))
      }}
    />
  )
}

// Блок B: воронки -------------------------------------------
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
          <p className="text-sm text-muted-foreground">Воронок ще немає. Додай — наприклад «Вебінарна», «Автовеб», «Прямі продажі».</p>
        ) : (
          funnels.map((f) => <FunnelCard key={f.id} funnel={f} projectId={projectId} products={products} />)
        )}
      </CardContent>
      <NewFunnelDialog trackerId={tracker.id} projectId={projectId} products={products} open={newOpen} onOpenChange={setNewOpen} />
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
  const [productId, setProductId] = useState('')
  const [appPlan, setAppPlan] = useState('')
  const [salesPlan, setSalesPlan] = useState('')
  const [revPlan, setRevPlan] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Нова воронка</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Назва</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Автовеб / Живий веб / Діагностика…" autoFocus />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isMini} onChange={(e) => setIsMini(e.target.checked)} />
            Мини-продукт (трипвайр)
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
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">План анкет</Label>
              <Input type="number" min={0} value={appPlan} onChange={(e) => setAppPlan(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">План продажів</Label>
              <Input type="number" min={0} value={salesPlan} onChange={(e) => setSalesPlan(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">План виручки $</Label>
              <Input type="number" min={0} step="any" value={revPlan} onChange={(e) => setRevPlan(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Відміна</Button>
          <Button
            disabled={!name.trim()}
            onClick={() =>
              startTransition(async () => {
                await createFunnel({
                  tracker_id: trackerId,
                  project_id: projectId,
                  name: name.trim(),
                  is_mini_product: isMini,
                  product_id: productId || null,
                  applications_plan: Number(appPlan) || 0,
                  sales_plan: Number(salesPlan) || 0,
                  revenue_plan: Number(revPlan) || 0,
                })
                setName('')
                setIsMini(false)
                setProductId('')
                setAppPlan('')
                setSalesPlan('')
                setRevPlan('')
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

function FunnelCard({
  funnel,
  projectId,
  products,
}: {
  funnel: FullFunnel
  projectId: string
  products: Product[]
}) {
  const [, startTransition] = useTransition()
  const [editOpen, setEditOpen] = useState(false)

  const applications = funnel.journal.reduce((s, r) => s + r.applications, 0)
  const sales = funnel.journal.reduce((s, r) => s + r.sales_count, 0)
  const revenue = funnel.journal.reduce((s, r) => s + Number(r.revenue), 0)
  const traffic = funnel.journal.reduce((s, r) => s + Number(r.traffic_spend), 0)
  const appsPct = funnel.applications_plan > 0 ? Math.round((applications / funnel.applications_plan) * 100) : 0
  const salesPct = funnel.sales_plan > 0 ? Math.round((sales / funnel.sales_plan) * 100) : 0
  const revPct = funnel.revenue_plan > 0 ? Math.round((revenue / Number(funnel.revenue_plan)) * 100) : 0
  const convFact = applications > 0 ? Math.round((sales / applications) * 1000) / 10 : 0
  const convPlan = funnel.applications_plan > 0 ? Math.round((funnel.sales_plan / funnel.applications_plan) * 1000) / 10 : 0
  const product = products.find((p) => p.id === funnel.product_id)

  return (
    <div className="rounded-md border bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{funnel.name}</span>
          {funnel.is_mini_product ? (
            <Badge variant="secondary">Мини-продукт</Badge>
          ) : product ? (
            <Badge variant="secondary">→ {product.name}</Badge>
          ) : (
            <Badge variant="secondary">→ не привʼязано</Badge>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" onClick={() => setEditOpen(true)}>Налаштування</Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => {
              if (confirm('Видалити воронку?')) startTransition(() => deleteFunnel(funnel.id, projectId))
            }}
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <MiniMetric label="Анкети" plan={funnel.applications_plan} fact={applications} pct={appsPct} />
        <MiniMetric label="Продажі" plan={funnel.sales_plan} fact={sales} pct={salesPct} />
        <MiniMetric label="Виручка, $" plan={Number(funnel.revenue_plan)} fact={Math.round(revenue)} pct={revPct} />
        <div className="rounded-md border bg-background p-2 text-xs">
          <div className="text-muted-foreground">Конверсія</div>
          <div className="mt-1">
            <strong>{convFact}%</strong> / {convPlan}%
          </div>
          {traffic > 0 ? <div className="mt-1 text-[10px] text-muted-foreground">Трафік: {fmt(traffic)}</div> : null}
        </div>
      </div>

      <FunnelEditDialog funnel={funnel} projectId={projectId} products={products} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  )
}

function MiniMetric({ label, plan, fact, pct }: { label: string; plan: number; fact: number; pct: number }) {
  return (
    <div className="rounded-md border bg-background p-2 text-xs">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-1">
        <strong>{fmt(fact)}</strong>
        <span className="text-muted-foreground"> / {fmt(plan)}</span>
      </div>
      {plan > 0 ? (
        <div className="mt-1 h-1 overflow-hidden rounded bg-muted">
          <div
            className={cn('h-full', pct >= 100 ? 'bg-emerald-500' : pct >= 70 ? 'bg-foreground/70' : 'bg-red-500')}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
      ) : null}
    </div>
  )
}

function FunnelEditDialog({
  funnel,
  projectId,
  products,
  open,
  onOpenChange,
}: {
  funnel: FullFunnel
  projectId: string
  products: Product[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [, startTransition] = useTransition()
  const [newPriceName, setNewPriceName] = useState('')
  const [newPriceVal, setNewPriceVal] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{funnel.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              defaultChecked={funnel.is_mini_product}
              onChange={(e) =>
                startTransition(() => updateFunnel(funnel.id, projectId, { is_mini_product: e.target.checked }))
              }
            />
            Мини-продукт
          </label>
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
            <div className="space-y-2 rounded-md border bg-muted/30 p-2">
              <Label className="text-xs">Ціни мини-продукту</Label>
              {funnel.mini_prices.length === 0 ? (
                <p className="text-xs text-muted-foreground">Поки немає тарифів. Додай нижче.</p>
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
              <div className="grid grid-cols-[1fr_100px_auto] gap-1">
                <Input value={newPriceName} onChange={(e) => setNewPriceName(e.target.value)} placeholder="Тариф" className="h-8" />
                <Input
                  type="number"
                  value={newPriceVal}
                  onChange={(e) => setNewPriceVal(e.target.value)}
                  placeholder="$"
                  className="h-8"
                />
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
          )}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">План анкет</Label>
              <Input
                type="number"
                min={0}
                defaultValue={funnel.applications_plan}
                onBlur={(e) =>
                  startTransition(() => updateFunnel(funnel.id, projectId, { applications_plan: Number(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">План продажів</Label>
              <Input
                type="number"
                min={0}
                defaultValue={funnel.sales_plan}
                onBlur={(e) => startTransition(() => updateFunnel(funnel.id, projectId, { sales_plan: Number(e.target.value) || 0 }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">План виручки $</Label>
              <Input
                type="number"
                min={0}
                step="any"
                defaultValue={Number(funnel.revenue_plan)}
                onBlur={(e) =>
                  startTransition(() => updateFunnel(funnel.id, projectId, { revenue_plan: Number(e.target.value) || 0 }))
                }
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Готово</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Журнал лідів і продажів ----------------------------------
function Journal({
  projectId,
  tracker,
  funnels,
}: {
  projectId: string
  tracker: MonthlyTracker
  funnels: FullFunnel[]
}) {
  const [, startTransition] = useTransition()

  // Список существующих строк + быстрая «новая строка»
  const allRows = useMemo(() => {
    const rows: (FunnelDailyJournal & { funnel_name: string; funnel_id: string })[] = []
    for (const f of funnels) {
      for (const r of f.journal) rows.push({ ...r, funnel_name: f.name, funnel_id: f.id })
    }
    return rows.sort((a, b) => a.day_date.localeCompare(b.day_date))
  }, [funnels])

  // Состояние для новой строки
  const [draft, setDraft] = useState({
    day_date: dayIso(tracker.year, tracker.month, new Date().getUTCDate()),
    funnel_id: funnels[0]?.id ?? '',
    applications: '',
    op_calls: '',
    sales_count: '',
    revenue: '',
    traffic_spend: '',
    comment: '',
  })

  const submitDraft = () => {
    if (!draft.funnel_id) return
    startTransition(async () => {
      await upsertJournalRow({
        funnel_id: draft.funnel_id,
        project_id: projectId,
        day_date: draft.day_date,
        applications: Number(draft.applications) || 0,
        op_calls: Number(draft.op_calls) || 0,
        sales_count: Number(draft.sales_count) || 0,
        revenue: Number(draft.revenue) || 0,
        traffic_spend: Number(draft.traffic_spend) || 0,
        comment: draft.comment,
      })
      setDraft((s) => ({ ...s, applications: '', op_calls: '', sales_count: '', revenue: '', traffic_spend: '', comment: '' }))
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Щоденний журнал лідів і продажів</CardTitle>
        <p className="text-xs text-muted-foreground">Заповнюй щодня. Один рядок = підсумок дня по одному джерелу.</p>
      </CardHeader>
      <CardContent className="p-0">
        {funnels.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">Спочатку додай хоча б одну воронку у блоці B.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left">Дата</th>
                  <th className="px-2 py-2 text-left">День</th>
                  <th className="px-2 py-2 text-left">Джерело</th>
                  <th className="px-2 py-2 text-right">Анкет</th>
                  <th className="px-2 py-2 text-right">Дзв. ОП</th>
                  <th className="px-2 py-2 text-right">Продажів</th>
                  <th className="px-2 py-2 text-right">Виручка $</th>
                  <th className="px-2 py-2 text-right">Витрати $</th>
                  <th className="px-2 py-2 text-left">Коментар</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {allRows.map((r) => (
                  <JournalRow key={r.id} row={r} projectId={projectId} />
                ))}

                {/* Новая строка */}
                <tr className="bg-muted/20">
                  <td className="px-2 py-1">
                    <Input
                      type="date"
                      value={draft.day_date}
                      onChange={(e) => setDraft((s) => ({ ...s, day_date: e.target.value }))}
                      className="h-7 text-xs"
                    />
                  </td>
                  <td className="px-2 py-1 text-xs text-muted-foreground">{dayOfWeek(draft.day_date)}</td>
                  <td className="px-2 py-1">
                    <select
                      value={draft.funnel_id}
                      onChange={(e) => setDraft((s) => ({ ...s, funnel_id: e.target.value }))}
                      className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {funnels.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                  </td>
                  {(['applications', 'op_calls', 'sales_count', 'revenue', 'traffic_spend'] as const).map((k) => (
                    <td key={k} className="px-2 py-1">
                      <Input
                        type="number"
                        step="any"
                        value={draft[k] as string}
                        onChange={(e) => setDraft((s) => ({ ...s, [k]: e.target.value }))}
                        className="h-7 text-right text-xs"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1">
                    <Input
                      value={draft.comment}
                      onChange={(e) => setDraft((s) => ({ ...s, comment: e.target.value }))}
                      className="h-7 text-xs"
                      placeholder="опц."
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
      </CardContent>
    </Card>
  )
}

function JournalRow({
  row,
  projectId,
}: {
  row: FunnelDailyJournal & { funnel_name: string }
  projectId: string
}) {
  const [, startTransition] = useTransition()
  const upd = (field: 'applications' | 'op_calls' | 'sales_count' | 'revenue' | 'traffic_spend', e: React.FocusEvent<HTMLInputElement>) => {
    const v = Number(e.target.value) || 0
    if (v !== Number(row[field])) startTransition(() => updateJournalField(row.id, projectId, field, v))
  }
  return (
    <tr className="hover:bg-muted/10">
      <td className="px-2 py-1 text-xs">{ru(row.day_date)}</td>
      <td className="px-2 py-1 text-xs text-muted-foreground">{dayOfWeek(row.day_date)}</td>
      <td className="px-2 py-1 text-xs">{row.funnel_name}</td>
      {(['applications', 'op_calls', 'sales_count', 'revenue', 'traffic_spend'] as const).map((k) => (
        <td key={k} className="px-2 py-1">
          <Input
            type="number"
            step="any"
            defaultValue={Number(row[k]) || ''}
            onBlur={(e) => upd(k, e)}
            className="h-7 text-right text-xs"
          />
        </td>
      ))}
      <td className="px-2 py-1">
        <Input
          defaultValue={row.comment ?? ''}
          onBlur={(e) => {
            const v = e.target.value
            if (v !== (row.comment ?? '')) startTransition(() => updateJournalField(row.id, projectId, 'comment', v || null))
          }}
          className="h-7 text-xs"
        />
      </td>
      <td className="px-2 py-1 text-right">
        <button
          type="button"
          onClick={() => {
            if (confirm('Видалити рядок?')) startTransition(() => deleteJournalRow(row.id, projectId))
          }}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  )
}

// Блок C: трафик ---------------------------------------------
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
  const spend = funnels.reduce(
    (s, f) => s + f.journal.reduce((ss, r) => ss + Number(r.traffic_spend), 0),
    0,
  )
  const apps = funnels.reduce((s, f) => s + f.journal.reduce((ss, r) => ss + r.applications, 0), 0)
  const revenue = funnels.reduce((s, f) => s + f.journal.reduce((ss, r) => ss + Number(r.revenue), 0), 0)
  const cpl = apps > 0 ? Math.round(spend / apps) : 0
  const roas = spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">C. Трафік</CardTitle>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={tracker.traffic_enabled}
            onChange={(e) => startTransition(() => updateTrackerField(tracker.id, projectId, 'traffic_enabled', e.target.checked))}
          />
          Платний трафік є
        </label>
      </CardHeader>
      {tracker.traffic_enabled ? (
        <CardContent className="grid gap-3 sm:grid-cols-4">
          <Stat title="Витрати (сума)" value={fmt(spend)} />
          <Stat title="Анкет" value={fmt(apps)} />
          <Stat title="CPL" value={fmt(cpl)} />
          <Stat title="ROAS" value={String(roas)} />
        </CardContent>
      ) : (
        <CardContent className="text-sm text-muted-foreground">
          Якщо немає платного трафіку — залиш вимкненим. Інакше включи і вводь витрати у журналі.
        </CardContent>
      )}
    </Card>
  )
}

// Блок D: качество работы ------------------------------------
function BlockD({ projectId, tracker }: { projectId: string; tracker: MonthlyTracker }) {
  const [, startTransition] = useTransition()
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">D. Якість роботи з експертом</CardTitle>
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
