'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Lock, LockOpen, Plus, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { LAUNCH_STATUS_LABEL, MONTH_LABEL_RU } from '@/lib/labels'
import type {
  LaunchStatus,
  MonthlyTracker,
  TrackerDailyLog,
} from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

import {
  addStage,
  closeMonth,
  createFunnel,
  deleteFunnel,
  deleteStage,
  reopenMonth,
  renameFunnel,
  setDailyAmount,
  setStageDailyAmount,
  updateStage,
  updateTracker,
} from './actions'
import type { FunnelWithStages } from '@/lib/queries/trackers'

// ------------------------------------------------------------
// Утилиты
// ------------------------------------------------------------
function fmt(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function dayIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function weeks(year: number, month: number): { idx: number; days: number[] }[] {
  const total = daysInMonth(year, month)
  const w: { idx: number; days: number[] }[] = []
  for (let i = 0; i < 4; i++) {
    const start = i * 7 + 1
    if (start > total) break
    const end = i === 3 ? total : Math.min(start + 6, total)
    w.push({ idx: i + 1, days: Array.from({ length: end - start + 1 }, (_, j) => start + j) })
  }
  return w
}

function sumLogs(logs: TrackerDailyLog[], kind: 'revenue' | 'traffic_spend' | 'leads'): number {
  return logs.filter((l) => l.kind === kind).reduce((s, l) => s + Number(l.amount), 0)
}

function sumLogsInRange(
  logs: TrackerDailyLog[],
  kind: 'revenue' | 'traffic_spend' | 'leads',
  days: number[],
  year: number,
  month: number,
): number {
  const set = new Set(days.map((d) => dayIso(year, month, d)))
  return logs
    .filter((l) => l.kind === kind && set.has(l.day_date))
    .reduce((s, l) => s + Number(l.amount), 0)
}

function flagFor(pct: number): 'green' | 'yellow' | 'red' {
  if (pct >= 85) return 'green'
  if (pct >= 70) return 'yellow'
  return 'red'
}

function flagDot(f: 'green' | 'yellow' | 'red') {
  return (
    <span
      className={cn(
        'inline-block h-2.5 w-2.5 rounded-full',
        f === 'green' ? 'bg-emerald-500' : f === 'yellow' ? 'bg-amber-500' : 'bg-red-500',
      )}
    />
  )
}

// ------------------------------------------------------------
// Орхестратор
// ------------------------------------------------------------
export function TrackerView({
  projectId,
  tracker,
  dailyLogs,
  funnels,
}: {
  projectId: string
  tracker: MonthlyTracker
  dailyLogs: TrackerDailyLog[]
  funnels: FunnelWithStages[]
}) {
  const closed = tracker.status === 'closed'
  const total = sumLogs(dailyLogs, 'revenue')
  const pct = tracker.revenue_plan > 0 ? Math.round((total / tracker.revenue_plan) * 100) : 0

  return (
    <div className="space-y-6">
      <MonthSwitcher projectId={projectId} tracker={tracker} />

      {closed ? (
        <ClosedBanner trackerId={tracker.id} projectId={projectId} />
      ) : null}

      <BlockRevenue
        tracker={tracker}
        dailyLogs={dailyLogs}
        projectId={projectId}
        disabled={closed}
        totalActual={total}
        pct={pct}
      />

      <BlockFunnels
        trackerId={tracker.id}
        projectId={projectId}
        funnels={funnels}
        year={tracker.year}
        month={tracker.month}
        disabled={closed}
      />

      <BlockTraffic tracker={tracker} dailyLogs={dailyLogs} projectId={projectId} disabled={closed} />

      <BlockQuality tracker={tracker} projectId={projectId} disabled={closed} />

      <BlockSummary tracker={tracker} projectId={projectId} disabled={closed} />

      <CloseMonthBar tracker={tracker} projectId={projectId} pct={pct} />
    </div>
  )
}

// ------------------------------------------------------------
// Header — переключатель месяцев
// ------------------------------------------------------------
function MonthSwitcher({ projectId, tracker }: { projectId: string; tracker: MonthlyTracker }) {
  const prev = new Date(Date.UTC(tracker.year, tracker.month - 2, 1))
  const next = new Date(Date.UTC(tracker.year, tracker.month, 1))
  const prevYm = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`
  const nextYm = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-sm"
          nativeButton={false}
          render={<Link href={`/projects/${projectId}/tracker?ym=${prevYm}`} />}
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
          render={<Link href={`/projects/${projectId}/tracker?ym=${nextYm}`} />}
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

function ClosedBanner({ trackerId, projectId }: { trackerId: string; projectId: string }) {
  const [, startTransition] = useTransition()
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/40 px-4 py-2">
      <div className="flex items-center gap-2 text-sm">
        <Lock className="h-4 w-4" />
        Месяц закрыт — редактирование заблокировано.
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => startTransition(() => reopenMonth(trackerId, projectId))}
      >
        <LockOpen className="mr-1 h-3.5 w-3.5" />
        Открыть заново
      </Button>
    </div>
  )
}

// ------------------------------------------------------------
// Блок A — Выручка
// ------------------------------------------------------------
function BlockRevenue({
  tracker,
  dailyLogs,
  projectId,
  disabled,
  totalActual,
  pct,
}: {
  tracker: MonthlyTracker
  dailyLogs: TrackerDailyLog[]
  projectId: string
  disabled: boolean
  totalActual: number
  pct: number
}) {
  const [openWeek, setOpenWeek] = useState<number | null>(null)
  const weekList = weeks(tracker.year, tracker.month)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          A. Выручка
          {flagDot(flagFor(pct))}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">План на месяц</Label>
            <PlanInput
              defaultValue={tracker.revenue_plan}
              trackerId={tracker.id}
              projectId={projectId}
              field="revenue_plan"
              disabled={disabled}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Факт (сумма по дням)</Label>
            <div className="rounded-md border bg-card/40 px-3 py-2 text-sm font-medium">
              {fmt(totalActual)}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">% выполнения</Label>
            <div className="rounded-md border bg-card/40 px-3 py-2 text-sm font-medium">
              {pct}%
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          {weekList.map((w) => {
            const wTotal = sumLogsInRange(dailyLogs, 'revenue', w.days, tracker.year, tracker.month)
            const planShare = tracker.revenue_plan / weekList.length
            const wPct = planShare > 0 ? Math.round((wTotal / planShare) * 100) : 0
            const active = openWeek === w.idx
            return (
              <button
                key={w.idx}
                type="button"
                onClick={() => setOpenWeek(active ? null : w.idx)}
                className={cn(
                  'group rounded-md border p-3 text-left transition-colors',
                  active ? 'border-foreground/40 bg-muted/40' : 'hover:bg-muted/30',
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">Неделя {w.idx}</div>
                  {flagDot(flagFor(wPct))}
                </div>
                <div className="mt-1 text-sm font-medium">{fmt(wTotal)}</div>
                <div className="text-[11px] text-muted-foreground">{wPct}% от доли плана</div>
              </button>
            )
          })}
        </div>

        {openWeek !== null ? (
          <div className="rounded-md border bg-card/40 p-3">
            <div className="mb-2 text-xs text-muted-foreground">Дневной ввод за неделю {openWeek}:</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
              {weekList
                .find((w) => w.idx === openWeek)
                ?.days.map((d) => {
                  const day = dayIso(tracker.year, tracker.month, d)
                  const entry = dailyLogs.find((l) => l.kind === 'revenue' && l.day_date === day)
                  return (
                    <DailyInput
                      key={day}
                      day={d}
                      defaultValue={entry?.amount ?? 0}
                      onCommit={(value) =>
                        setDailyAmount(tracker.id, projectId, day, 'revenue', value)
                      }
                      disabled={disabled}
                    />
                  )
                })}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------
// Блок B — Воронки
// ------------------------------------------------------------
function BlockFunnels({
  trackerId,
  projectId,
  funnels,
  year,
  month,
  disabled,
}: {
  trackerId: string
  projectId: string
  funnels: FunnelWithStages[]
  year: number
  month: number
  disabled: boolean
}) {
  const [, startTransition] = useTransition()
  const [newOpen, setNewOpen] = useState(false)
  const [newName, setNewName] = useState('')

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">B. Воронки</CardTitle>
        <Button size="sm" variant="outline" disabled={disabled} onClick={() => setNewOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Воронка
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {newOpen ? (
          <div className="flex gap-2 rounded-md border bg-card/40 p-3">
            <Input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Имя воронки (Вебинар-запуск / Отдел продаж / Tripwire …)"
            />
            <Button
              size="sm"
              onClick={() => {
                if (!newName.trim()) return
                startTransition(async () => {
                  await createFunnel(trackerId, projectId, newName.trim())
                  setNewName('')
                  setNewOpen(false)
                })
              }}
            >
              Создать
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setNewOpen(false)}>
              Отмена
            </Button>
          </div>
        ) : null}

        {funnels.length === 0 && !newOpen ? (
          <p className="text-sm text-muted-foreground">
            Воронок ещё нет. Добавь — например «Вебинар-запуск».
          </p>
        ) : null}

        {funnels.map((f) => (
          <FunnelCard
            key={f.id}
            funnel={f}
            projectId={projectId}
            year={year}
            month={month}
            disabled={disabled}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function FunnelCard({
  funnel,
  projectId,
  year,
  month,
  disabled,
}: {
  funnel: FunnelWithStages
  projectId: string
  year: number
  month: number
  disabled: boolean
}) {
  const [, startTransition] = useTransition()
  const [addOpen, setAddOpen] = useState(false)
  const [newStage, setNewStage] = useState({ name: '', plan: '', unit: 'шт' })

  return (
    <div className="rounded-md border bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <Input
          className="h-8 max-w-xs text-sm font-medium"
          defaultValue={funnel.name}
          disabled={disabled}
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v && v !== funnel.name) startTransition(() => renameFunnel(funnel.id, projectId, v))
          }}
        />
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => setAddOpen((o) => !o)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Этап
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              if (confirm('Удалить воронку со всеми этапами?'))
                startTransition(() => deleteFunnel(funnel.id, projectId))
            }}
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </div>

      {addOpen ? (
        <div className="mb-2 grid gap-2 rounded-md border bg-background p-2 sm:grid-cols-[1fr_120px_80px_auto]">
          <Input
            placeholder="Этап (Охват / Лиды / Заявки / Продажи)"
            value={newStage.name}
            onChange={(e) => setNewStage((s) => ({ ...s, name: e.target.value }))}
          />
          <Input
            type="number"
            placeholder="План"
            value={newStage.plan}
            onChange={(e) => setNewStage((s) => ({ ...s, plan: e.target.value }))}
          />
          <Input
            placeholder="шт / ₽"
            value={newStage.unit}
            onChange={(e) => setNewStage((s) => ({ ...s, unit: e.target.value }))}
          />
          <Button
            size="sm"
            onClick={() => {
              const plan = Number(newStage.plan)
              if (!newStage.name.trim() || !Number.isFinite(plan)) return
              startTransition(async () => {
                await addStage(funnel.id, projectId, newStage.name.trim(), plan, newStage.unit)
                setNewStage({ name: '', plan: '', unit: 'шт' })
                setAddOpen(false)
              })
            }}
          >
            Добавить
          </Button>
        </div>
      ) : null}

      <div className="space-y-2">
        {funnel.stages.map((s, i) => {
          const total = s.logs.reduce((acc, l) => acc + Number(l.amount), 0)
          const pct = s.plan_value > 0 ? Math.round((total / s.plan_value) * 100) : 0
          const prevStage = funnel.stages[i - 1]
          const prevTotal = prevStage
            ? prevStage.logs.reduce((acc, l) => acc + Number(l.amount), 0)
            : null
          const conv = prevTotal && prevTotal > 0 ? Math.round((total / prevTotal) * 100) : null
          return (
            <FunnelStageRow
              key={s.id}
              stageId={s.id}
              name={s.name}
              unit={s.unit}
              plan={s.plan_value}
              actual={total}
              pct={pct}
              conv={conv}
              logs={s.logs}
              year={year}
              month={month}
              projectId={projectId}
              disabled={disabled}
            />
          )
        })}
        {funnel.stages.length === 0 ? (
          <p className="text-xs text-muted-foreground">Этапов нет.</p>
        ) : null}
      </div>
    </div>
  )
}

function FunnelStageRow({
  stageId,
  name,
  unit,
  plan,
  actual,
  pct,
  conv,
  logs,
  year,
  month,
  projectId,
  disabled,
}: {
  stageId: string
  name: string
  unit: string
  plan: number
  actual: number
  pct: number
  conv: number | null
  logs: { day_date: string; amount: number }[]
  year: number
  month: number
  projectId: string
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [, startTransition] = useTransition()
  return (
    <div className="rounded-md border bg-background">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <Input
            defaultValue={name}
            disabled={disabled}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const v = e.target.value.trim()
              if (v && v !== name) startTransition(() => updateStage(stageId, projectId, { name: v }))
            }}
            className="h-7 border-0 bg-transparent px-0 text-sm font-medium shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs">
          <div>
            <span className="font-medium">{fmt(actual)}</span>
            <span className="text-muted-foreground"> / {fmt(plan)} {unit}</span>
          </div>
          <Badge variant="secondary">{pct}%</Badge>
          {conv !== null ? (
            <span className="text-muted-foreground">конв. {conv}%</span>
          ) : null}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (confirm('Удалить этап?')) startTransition(() => deleteStage(stageId, projectId))
            }}
            disabled={disabled}
            className="text-muted-foreground hover:text-destructive disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </button>
      {open ? (
        <div className="border-t bg-card/40 p-3">
          <div className="mb-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span>План этапа:</span>
            <Input
              type="number"
              defaultValue={plan}
              disabled={disabled}
              className="h-7 w-32"
              onBlur={(e) => {
                const v = Number(e.target.value)
                if (Number.isFinite(v) && v !== plan)
                  startTransition(() => updateStage(stageId, projectId, { plan_value: v }))
              }}
            />
            <span>Единица:</span>
            <Input
              defaultValue={unit}
              disabled={disabled}
              className="h-7 w-20"
              onBlur={(e) => {
                const v = e.target.value.trim()
                if (v && v !== unit)
                  startTransition(() => updateStage(stageId, projectId, { unit: v }))
              }}
            />
          </div>
          <div className="text-xs text-muted-foreground">Дневной факт по этапу:</div>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
            {Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1).map((d) => {
              const day = dayIso(year, month, d)
              const entry = logs.find((l) => l.day_date === day)
              return (
                <DailyInput
                  key={day}
                  day={d}
                  defaultValue={entry?.amount ?? 0}
                  onCommit={(value) => setStageDailyAmount(stageId, projectId, day, value)}
                  disabled={disabled}
                />
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}

// ------------------------------------------------------------
// Блок C — Трафик
// ------------------------------------------------------------
function BlockTraffic({
  tracker,
  dailyLogs,
  projectId,
  disabled,
}: {
  tracker: MonthlyTracker
  dailyLogs: TrackerDailyLog[]
  projectId: string
  disabled: boolean
}) {
  const [, startTransition] = useTransition()
  const spend = sumLogs(dailyLogs, 'traffic_spend')
  const leads = sumLogs(dailyLogs, 'leads')
  const cpl = leads > 0 ? Math.round(spend / leads) : 0

  if (!tracker.traffic_enabled) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">C. Трафик</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => {
              const fd = new FormData()
              fd.set('id', tracker.id)
              fd.set('project_id', projectId)
              fd.set('traffic_enabled', 'true')
              startTransition(() => updateTracker(fd))
            }}
          >
            Включить блок «Трафик»
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">C. Трафик</CardTitle>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            const fd = new FormData()
            fd.set('id', tracker.id)
            fd.set('project_id', projectId)
            fd.set('traffic_enabled', 'false')
            startTransition(() => updateTracker(fd))
          }}
        >
          Выключить блок
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">План расхода</Label>
            <PlanInput
              defaultValue={tracker.traffic_spend_plan}
              trackerId={tracker.id}
              projectId={projectId}
              field="traffic_spend_plan"
              disabled={disabled}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Факт расхода (сумма)</Label>
            <div className="rounded-md border bg-card/40 px-3 py-2 text-sm font-medium">
              {fmt(spend)}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Лидов (сумма)</Label>
            <div className="rounded-md border bg-card/40 px-3 py-2 text-sm font-medium">
              {fmt(leads)}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">CPL</Label>
            <div className="rounded-md border bg-card/40 px-3 py-2 text-sm font-medium">
              {fmt(cpl)}
            </div>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <DailyGrid
            label="Дневной расход на трафик"
            year={tracker.year}
            month={tracker.month}
            logs={dailyLogs.filter((l) => l.kind === 'traffic_spend')}
            onCommit={(day, value) => setDailyAmount(tracker.id, projectId, day, 'traffic_spend', value)}
            disabled={disabled}
          />
          <DailyGrid
            label="Дневной приход лидов"
            year={tracker.year}
            month={tracker.month}
            logs={dailyLogs.filter((l) => l.kind === 'leads')}
            onCommit={(day, value) => setDailyAmount(tracker.id, projectId, day, 'leads', value)}
            disabled={disabled}
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------
// Блок D — Качество работы с экспертом
// ------------------------------------------------------------
function BlockQuality({
  tracker,
  projectId,
  disabled,
}: {
  tracker: MonthlyTracker
  projectId: string
  disabled: boolean
}) {
  const [, startTransition] = useTransition()

  const submitField = (k: string) => (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const fd = new FormData()
    fd.set('id', tracker.id)
    fd.set('project_id', projectId)
    fd.set(k, e.target.value)
    startTransition(() => updateTracker(fd))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">D. Качество работы с экспертом</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">NPS эксперта (0–10)</Label>
            <Input
              type="number"
              min={0}
              max={10}
              defaultValue={tracker.nps ?? ''}
              disabled={disabled}
              onBlur={submitField('nps')}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Запуск в срок</Label>
            <select
              defaultValue={tracker.launch_status ?? ''}
              disabled={disabled}
              onChange={(e) => {
                const fd = new FormData()
                fd.set('id', tracker.id)
                fd.set('project_id', projectId)
                fd.set('launch_status', e.target.value)
                startTransition(() => updateTracker(fd))
              }}
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <option value="">— не указано —</option>
              {(['on_time', 'partial', 'failed'] as LaunchStatus[]).map((s) => (
                <option key={s} value={s}>
                  {LAUNCH_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Как эксперт себя чувствует</Label>
          <Textarea
            rows={3}
            defaultValue={tracker.expert_mood ?? ''}
            disabled={disabled}
            onBlur={submitField('expert_mood')}
            placeholder="Краткое наблюдение продюсера"
          />
        </div>
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------
// Блок E — Резюме месяца
// ------------------------------------------------------------
function BlockSummary({
  tracker,
  projectId,
  disabled,
}: {
  tracker: MonthlyTracker
  projectId: string
  disabled: boolean
}) {
  const [, startTransition] = useTransition()
  const submit = (k: string) => (e: React.FocusEvent<HTMLTextAreaElement>) => {
    const fd = new FormData()
    fd.set('id', tracker.id)
    fd.set('project_id', projectId)
    fd.set(k, e.target.value)
    startTransition(() => updateTracker(fd))
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">E. Резюме месяца</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Главный вывод (1–2 предложения)</Label>
          <Textarea
            rows={2}
            defaultValue={tracker.summary_main ?? ''}
            disabled={disabled}
            onBlur={submit('summary_main')}
          />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Что сработало</Label>
            <Textarea
              rows={4}
              defaultValue={tracker.summary_worked ?? ''}
              disabled={disabled}
              onBlur={submit('summary_worked')}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Что не сработало</Label>
            <Textarea
              rows={4}
              defaultValue={tracker.summary_not_worked ?? ''}
              disabled={disabled}
              onBlur={submit('summary_not_worked')}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Что меняем в следующем месяце</Label>
            <Textarea
              rows={4}
              defaultValue={tracker.summary_changes ?? ''}
              disabled={disabled}
              onBlur={submit('summary_changes')}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function CloseMonthBar({
  tracker,
  projectId,
  pct,
}: {
  tracker: MonthlyTracker
  projectId: string
  pct: number
}) {
  const [, startTransition] = useTransition()
  if (tracker.status === 'closed') return null
  return (
    <div className="flex items-center justify-between rounded-md border bg-card/40 px-4 py-3">
      <div className="text-sm text-muted-foreground">
        Итог месяца: {pct}%. Перед закрытием заполни Блок E — потом нажми «Закрыть месяц».
      </div>
      <Button
        onClick={() => {
          if (!tracker.summary_main || tracker.summary_main.trim().length < 10) {
            if (!confirm('Главный вывод почти не заполнен. Всё равно закрыть месяц?')) return
          } else if (!confirm('Закрыть месяц? Дальше — перенос в годовую сводку.')) {
            return
          }
          startTransition(() => closeMonth(tracker.id, projectId))
        }}
      >
        <Lock className="mr-1 h-3.5 w-3.5" />
        Закрыть месяц
      </Button>
    </div>
  )
}

// ------------------------------------------------------------
// Переиспользуемые компоненты
// ------------------------------------------------------------
function PlanInput({
  defaultValue,
  trackerId,
  projectId,
  field,
  disabled,
}: {
  defaultValue: number
  trackerId: string
  projectId: string
  field: 'revenue_plan' | 'traffic_spend_plan'
  disabled: boolean
}) {
  const [, startTransition] = useTransition()
  return (
    <Input
      type="number"
      step="any"
      defaultValue={defaultValue}
      disabled={disabled}
      onBlur={(e) => {
        const v = Number(e.target.value)
        if (Number.isFinite(v) && v !== defaultValue) {
          const fd = new FormData()
          fd.set('id', trackerId)
          fd.set('project_id', projectId)
          fd.set(field, String(v))
          startTransition(() => updateTracker(fd))
        }
      }}
    />
  )
}

function DailyInput({
  day,
  defaultValue,
  onCommit,
  disabled,
}: {
  day: number
  defaultValue: number
  onCommit: (value: number) => void | Promise<void>
  disabled: boolean
}) {
  const [, startTransition] = useTransition()
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{day}</span>
      <Input
        type="number"
        step="any"
        defaultValue={defaultValue || ''}
        disabled={disabled}
        className="h-7 text-xs"
        onBlur={(e) => {
          const v = Number(e.target.value)
          if (Number.isFinite(v) && v !== defaultValue) {
            startTransition(() => {
              void onCommit(v)
            })
          }
        }}
      />
    </label>
  )
}

function DailyGrid({
  label,
  year,
  month,
  logs,
  onCommit,
  disabled,
}: {
  label: string
  year: number
  month: number
  logs: { day_date: string; amount: number }[]
  onCommit: (day: string, value: number) => void | Promise<void>
  disabled: boolean
}) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted-foreground">{label}</div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1).map((d) => {
          const day = dayIso(year, month, d)
          const entry = logs.find((l) => l.day_date === day)
          return (
            <DailyInput
              key={day}
              day={d}
              defaultValue={entry?.amount ?? 0}
              onCommit={(value) => onCommit(day, value)}
              disabled={disabled}
            />
          )
        })}
      </div>
    </div>
  )
}
