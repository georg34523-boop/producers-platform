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
import { Textarea } from '@/components/ui/textarea'
import type { FunnelWithStages, StageWithWeeks } from '@/lib/queries/funnels'
import type { FunnelStageWeek } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

import {
  createFunnel,
  createStage,
  createWeek,
  deleteFunnel,
  deleteStage,
  deleteWeek,
  type FunnelActionState,
  updateStage,
  updateWeek,
} from './actions'

function pct(actual: number, target: number) {
  if (target <= 0) return 0
  return Math.min(100, Math.round((actual / target) * 100))
}

function fmtNum(n: number) {
  return n.toLocaleString('ru-RU')
}

function fmtRange(start: string, end: string) {
  return `${new Date(start).toLocaleDateString('ru-RU')} – ${new Date(end).toLocaleDateString('ru-RU')}`
}

export function FunnelsView({
  projectId,
  funnels,
}: {
  projectId: string
  funnels: FunnelWithStages[]
}) {
  const [newOpen, setNewOpen] = useState(false)
  const [newStageFor, setNewStageFor] = useState<FunnelWithStages | null>(null)
  const [newWeekFor, setNewWeekFor] = useState<{
    stage: StageWithWeeks
    funnel: FunnelWithStages
  } | null>(null)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Воронки — стадии продаж/привлечения с план/фактом и разбивкой по неделям.
        </p>
        <Button onClick={() => setNewOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Воронка
        </Button>
      </div>

      {funnels.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Воронок ещё нет. Создай первую — например «Запуск курса май» с стадиями
            Охват → Лиды → Консультации → Продажи.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {funnels.map((f) => (
            <FunnelCard
              key={f.id}
              funnel={f}
              projectId={projectId}
              onAddStage={() => setNewStageFor(f)}
              onAddWeek={(stage) => setNewWeekFor({ stage, funnel: f })}
            />
          ))}
        </div>
      )}

      <NewFunnelDialog projectId={projectId} open={newOpen} onOpenChange={setNewOpen} />
      {newStageFor ? (
        <NewStageDialog
          projectId={projectId}
          funnel={newStageFor}
          open
          onOpenChange={(o) => !o && setNewStageFor(null)}
        />
      ) : null}
      {newWeekFor ? (
        <NewWeekDialog
          projectId={projectId}
          stage={newWeekFor.stage}
          funnel={newWeekFor.funnel}
          open
          onOpenChange={(o) => !o && setNewWeekFor(null)}
        />
      ) : null}
    </div>
  )
}

function FunnelCard({
  funnel,
  projectId,
  onAddStage,
  onAddWeek,
}: {
  funnel: FunnelWithStages
  projectId: string
  onAddStage: () => void
  onAddWeek: (s: StageWithWeeks) => void
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{funnel.name}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {fmtRange(funnel.period_start, funnel.period_end)}
              {funnel.description ? ` · ${funnel.description}` : ''}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              if (confirm('Удалить воронку со всеми стадиями?')) {
                void deleteFunnel(funnel.id, projectId)
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {funnel.stages.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Нет стадий. Добавь первую — например «Охват».
          </p>
        ) : (
          funnel.stages.map((s) => (
            <StageRow
              key={s.id}
              stage={s}
              projectId={projectId}
              onAddWeek={() => onAddWeek(s)}
            />
          ))
        )}
        <Button variant="outline" size="sm" onClick={onAddStage}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Стадия
        </Button>
      </CardContent>
    </Card>
  )
}

function StageRow({
  stage,
  projectId,
  onAddWeek,
}: {
  stage: StageWithWeeks
  projectId: string
  onAddWeek: () => void
}) {
  const [, startTransition] = useTransition()
  const [name, setName] = useState(stage.name)
  const [unit, setUnit] = useState(stage.unit ?? '')
  const [target, setTarget] = useState(String(stage.target_value))
  const [actual, setActual] = useState(String(stage.actual_value))

  const p = pct(Number(actual) || 0, Number(target) || 0)

  const save = (patch: Parameters<typeof updateStage>[2]) =>
    startTransition(() => updateStage(stage.id, projectId, patch))

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== stage.name && save({ name })}
          className="h-8 max-w-48 text-sm"
        />
        <span className="text-xs text-muted-foreground">цель</span>
        <Input
          type="number"
          step="any"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          onBlur={() => Number(target) !== stage.target_value && save({ target_value: Number(target) })}
          className="h-8 w-24 text-sm"
        />
        <span className="text-xs text-muted-foreground">факт</span>
        <Input
          type="number"
          step="any"
          value={actual}
          onChange={(e) => setActual(e.target.value)}
          onBlur={() => Number(actual) !== stage.actual_value && save({ actual_value: Number(actual) })}
          className="h-8 w-24 text-sm"
        />
        <Input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          onBlur={() => unit !== (stage.unit ?? '') && save({ unit: unit || null })}
          placeholder="ед."
          className="h-8 w-16 text-sm"
        />
        <span className="ml-auto text-xs font-medium">{p}%</span>
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => {
            if (confirm('Удалить стадию?')) void deleteStage(stage.id, projectId)
          }}
          aria-label="Удалить стадию"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded bg-muted">
        <div
          className={cn('h-full', p >= 100 ? 'bg-emerald-500' : 'bg-foreground/70')}
          style={{ width: `${p}%` }}
        />
      </div>

      <div className="mt-3 space-y-1">
        {stage.weeks.length > 0 ? (
          <div className="space-y-1">
            {stage.weeks.map((w) => (
              <WeekRow key={w.id} week={w} projectId={projectId} unit={stage.unit} />
            ))}
          </div>
        ) : null}
        <Button variant="ghost" size="sm" onClick={onAddWeek} className="text-xs">
          <Plus className="mr-1 h-3 w-3" />
          Неделя
        </Button>
      </div>
    </div>
  )
}

function WeekRow({
  week,
  projectId,
  unit,
}: {
  week: FunnelStageWeek
  projectId: string
  unit: string | null
}) {
  const [, startTransition] = useTransition()
  const [target, setTarget] = useState(String(week.target))
  const [actual, setActual] = useState(String(week.actual))

  return (
    <div className="flex items-center gap-2 rounded bg-muted/30 px-2 py-1 text-xs">
      <span className="min-w-32 text-muted-foreground">
        {new Date(week.week_start).toLocaleDateString('ru-RU')} –{' '}
        {new Date(week.week_end).toLocaleDateString('ru-RU')}
      </span>
      <span className="text-muted-foreground">цель</span>
      <Input
        type="number"
        step="any"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        onBlur={() =>
          Number(target) !== week.target &&
          startTransition(() => updateWeek(week.id, projectId, { target: Number(target) }))
        }
        className="h-7 w-20 text-xs"
      />
      <span className="text-muted-foreground">факт</span>
      <Input
        type="number"
        step="any"
        value={actual}
        onChange={(e) => setActual(e.target.value)}
        onBlur={() =>
          Number(actual) !== week.actual &&
          startTransition(() => updateWeek(week.id, projectId, { actual: Number(actual) }))
        }
        className="h-7 w-20 text-xs"
      />
      <span className="text-muted-foreground">{unit ?? ''}</span>
      <span className="ml-auto font-medium">
        {pct(Number(actual) || 0, Number(target) || 0)}%
      </span>
      <button
        type="button"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => {
          if (confirm('Удалить неделю?')) void deleteWeek(week.id, projectId)
        }}
        aria-label="Удалить неделю"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  )
}

function NewFunnelDialog({
  projectId,
  open,
  onOpenChange,
}: {
  projectId: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [state, action, pending] = useActionState<FunnelActionState, FormData>(
    createFunnel,
    undefined,
  )
  const now = new Date()
  const defaultStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Новая воронка</DialogTitle>
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
            <Label htmlFor="f-name">Название</Label>
            <Input id="f-name" name="name" required autoFocus placeholder="Запуск курса май" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="f-desc">Описание</Label>
            <Textarea id="f-desc" name="description" rows={2} placeholder="Опционально" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="f-start">Старт периода (обычно 1-е число месяца)</Label>
            <Input id="f-start" name="period_start" type="date" defaultValue={defaultStart} required />
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

function NewStageDialog({
  projectId,
  funnel,
  open,
  onOpenChange,
}: {
  projectId: string
  funnel: FunnelWithStages
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [state, action, pending] = useActionState<FunnelActionState, FormData>(
    createStage,
    undefined,
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Стадия воронки «{funnel.name}»</DialogTitle>
        </DialogHeader>
        <form
          action={(fd) => {
            action(fd)
            onOpenChange(false)
          }}
          className="space-y-3"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="funnel_id" value={funnel.id} />
          <div className="space-y-2">
            <Label htmlFor="s-name">Название</Label>
            <Input id="s-name" name="name" required autoFocus placeholder="Лиды / Заявки / Продажи" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="s-target">Цель за период</Label>
              <Input id="s-target" name="target_value" type="number" step="any" defaultValue={0} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="s-unit">Единица</Label>
              <Input id="s-unit" name="unit" placeholder="шт / ₽ / %" />
            </div>
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

function NewWeekDialog({
  projectId,
  stage,
  funnel,
  open,
  onOpenChange,
}: {
  projectId: string
  stage: StageWithWeeks
  funnel: FunnelWithStages
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [state, action, pending] = useActionState<FunnelActionState, FormData>(
    createWeek,
    undefined,
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Неделя для «{stage.name}»</DialogTitle>
        </DialogHeader>
        <form
          action={(fd) => {
            action(fd)
            onOpenChange(false)
          }}
          className="space-y-3"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="stage_id" value={stage.id} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="w-start">С</Label>
              <Input id="w-start" name="week_start" type="date" defaultValue={funnel.period_start} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="w-end">По</Label>
              <Input id="w-end" name="week_end" type="date" defaultValue={funnel.period_end} required />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="w-target">Цель за неделю</Label>
            <Input id="w-target" name="target" type="number" step="any" defaultValue={0} />
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
