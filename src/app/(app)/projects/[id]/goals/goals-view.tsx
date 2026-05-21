'use client'

import { useActionState, useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'

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
import type { MonthGoal } from '@/lib/queries/goals'
import type { GoalMetric } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

import {
  addMetric,
  createMonthGoal,
  createWeekGoal,
  deleteGoal,
  deleteMetric,
  type GoalActionState,
  updateMetricActual,
} from './actions'

function pct(actual: number, target: number): number {
  if (target <= 0) return 0
  return Math.min(100, Math.round((actual / target) * 100))
}

function fmtNum(n: number): string {
  return n.toLocaleString('ru-RU')
}

function fmtRange(start: string, end: string): string {
  const s = new Date(start)
  const e = new Date(end)
  return `${s.toLocaleDateString('ru-RU')} – ${e.toLocaleDateString('ru-RU')}`
}

export function GoalsView({ projectId, goals }: { projectId: string; goals: MonthGoal[] }) {
  const [newMonthOpen, setNewMonthOpen] = useState(false)
  const [weekOpenFor, setWeekOpenFor] = useState<MonthGoal | null>(null)
  const [metricOpenFor, setMetricOpenFor] = useState<{ goalId: string; goalTitle: string } | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Цели месяца → неделя. Метрики синкаются с Google Sheets (позже), пока ввод руками.
        </p>
        <Button onClick={() => setNewMonthOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Цель месяца
        </Button>
      </div>

      {goals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Ещё нет целей. Создай цель на текущий месяц.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {goals.map((g) => (
            <Card key={g.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{g.title}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      Месяц: {fmtRange(g.period_start, g.period_end)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      if (confirm('Удалить цель месяца со всеми подцелями и метриками?')) {
                        void deleteGoal(g.id, projectId)
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Metrics
                  metrics={g.metrics}
                  projectId={projectId}
                  onAdd={() => setMetricOpenFor({ goalId: g.id, goalTitle: g.title })}
                />

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">Недели</span>
                    <Button variant="outline" size="sm" onClick={() => setWeekOpenFor(g)}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Неделя
                    </Button>
                  </div>
                  {g.weeks.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Недели ещё не запланированы.</p>
                  ) : (
                    <div className="space-y-3">
                      {g.weeks.map((w) => (
                        <div key={w.id} className="rounded-md border p-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="text-sm font-medium">{w.title}</div>
                              <div className="text-xs text-muted-foreground">
                                {fmtRange(w.period_start, w.period_end)}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => {
                                if (confirm('Удалить неделю?')) void deleteGoal(w.id, projectId)
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          </div>
                          <div className="mt-2">
                            <Metrics
                              metrics={w.metrics}
                              projectId={projectId}
                              onAdd={() =>
                                setMetricOpenFor({ goalId: w.id, goalTitle: w.title })
                              }
                              compact
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewMonthDialog
        projectId={projectId}
        open={newMonthOpen}
        onOpenChange={setNewMonthOpen}
      />

      {weekOpenFor ? (
        <NewWeekDialog
          projectId={projectId}
          parent={weekOpenFor}
          open
          onOpenChange={(o) => !o && setWeekOpenFor(null)}
        />
      ) : null}

      {metricOpenFor ? (
        <NewMetricDialog
          projectId={projectId}
          goalId={metricOpenFor.goalId}
          goalTitle={metricOpenFor.goalTitle}
          open
          onOpenChange={(o) => !o && setMetricOpenFor(null)}
        />
      ) : null}
    </div>
  )
}

function Metrics({
  metrics,
  projectId,
  onAdd,
  compact = false,
}: {
  metrics: GoalMetric[]
  projectId: string
  onAdd: () => void
  compact?: boolean
}) {
  return (
    <div className="space-y-2">
      {metrics.length === 0 ? (
        <div className="text-xs text-muted-foreground">Нет метрик</div>
      ) : (
        <div className={cn('grid gap-2', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-2 md:grid-cols-3')}>
          {metrics.map((m) => (
            <MetricCard key={m.id} metric={m} projectId={projectId} />
          ))}
        </div>
      )}
      <Button variant="ghost" size="sm" onClick={onAdd}>
        <Plus className="mr-1 h-3.5 w-3.5" />
        Добавить метрику
      </Button>
    </div>
  )
}

function MetricCard({ metric, projectId }: { metric: GoalMetric; projectId: string }) {
  const [actual, setActual] = useState(String(metric.actual_value))
  const [, startTransition] = useTransition()
  const p = pct(Number(actual) || 0, metric.target_value)
  const unit = metric.unit ?? ''

  return (
    <div className="rounded-md border bg-card/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{metric.name}</div>
          <div className="text-xs text-muted-foreground">
            Цель: {fmtNum(metric.target_value)} {unit}
          </div>
        </div>
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => {
            if (confirm('Удалить метрику?')) void deleteMetric(metric.id, projectId)
          }}
          aria-label="Удалить метрику"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Input
          type="number"
          value={actual}
          step="any"
          className="h-8 w-28 text-sm"
          onChange={(e) => setActual(e.target.value)}
          onBlur={() => {
            const n = Number(actual)
            if (Number.isFinite(n) && n !== metric.actual_value) {
              startTransition(() => updateMetricActual(metric.id, projectId, n))
            }
          }}
        />
        <span className="text-xs text-muted-foreground">{unit}</span>
        <span className="ml-auto text-xs font-medium">{p}%</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded bg-muted">
        <div
          className={cn('h-full', p >= 100 ? 'bg-emerald-500' : 'bg-foreground/70')}
          style={{ width: `${p}%` }}
        />
      </div>
    </div>
  )
}

function NewMonthDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [state, action, pending] = useActionState<GoalActionState, FormData>(createMonthGoal, undefined)
  const now = new Date()
  const defaultStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Цель на месяц</DialogTitle>
        </DialogHeader>
        <form
          action={(fd) => {
            action(fd)
            onOpenChange(false)
          }}
          className="space-y-3"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <div className="space-y-2">
            <Label htmlFor="gm-title">Название</Label>
            <Input id="gm-title" name="title" required autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="gm-start">1-е число месяца</Label>
            <Input id="gm-start" name="period_start" type="date" defaultValue={defaultStart} required />
          </div>
          {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Создаём…' : 'Создать'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NewWeekDialog({
  projectId,
  parent,
  open,
  onOpenChange,
}: {
  projectId: string
  parent: MonthGoal
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [state, action, pending] = useActionState<GoalActionState, FormData>(createWeekGoal, undefined)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Неделя месяца «{parent.title}»</DialogTitle>
        </DialogHeader>
        <form
          action={(fd) => {
            action(fd)
            onOpenChange(false)
          }}
          className="space-y-3"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="parent_goal_id" value={parent.id} />
          <div className="space-y-2">
            <Label htmlFor="gw-title">Название</Label>
            <Input id="gw-title" name="title" required autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="gw-start">С</Label>
              <Input
                id="gw-start"
                name="period_start"
                type="date"
                defaultValue={parent.period_start}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gw-end">По</Label>
              <Input
                id="gw-end"
                name="period_end"
                type="date"
                defaultValue={parent.period_end}
                required
              />
            </div>
          </div>
          {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Создаём…' : 'Создать'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function NewMetricDialog({
  projectId,
  goalId,
  goalTitle,
  open,
  onOpenChange,
}: {
  projectId: string
  goalId: string
  goalTitle: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [state, action, pending] = useActionState<GoalActionState, FormData>(addMetric, undefined)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Метрика для «{goalTitle}»</DialogTitle>
        </DialogHeader>
        <form
          action={(fd) => {
            action(fd)
            onOpenChange(false)
          }}
          className="space-y-3"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="goal_id" value={goalId} />
          <div className="space-y-2">
            <Label htmlFor="m-name">Название</Label>
            <Input id="m-name" name="name" required placeholder="Выручка / Заявки / CR" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="m-target">Цель</Label>
              <Input id="m-target" name="target_value" type="number" step="any" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="m-unit">Единица</Label>
              <Input id="m-unit" name="unit" placeholder="₽ / шт / %" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-actual">Текущее значение</Label>
            <Input id="m-actual" name="actual_value" type="number" step="any" defaultValue={0} />
          </div>
          {state?.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Добавляем…' : 'Добавить'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
