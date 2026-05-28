'use client'

import { useState, useTransition } from 'react'
import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { TrackerCustomDriver } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

import {
  addCustomGoal,
  deleteCustomGoal,
  incrementCustomGoal,
  updateCustomGoal,
} from './tracker/actions'

function fmt(n: number): string {
  return n.toLocaleString('ru-RU', { maximumFractionDigits: 0 })
}

export function CustomGoals({
  trackerId,
  projectId,
  goals,
}: {
  trackerId: string
  projectId: string
  goals: TrackerCustomDriver[]
}) {
  const [newOpen, setNewOpen] = useState(false)

  return (
    <div className="rounded-md border bg-card/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium">Кастомні цілі</div>
        <Button size="sm" variant="outline" onClick={() => setNewOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Додати ціль
        </Button>
      </div>

      {goals.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Наприклад: «Провести 20 кастдевів», «Зібрати 50 анкет», «Записати 10 відео».
          Кнопкою «+1» щодня підвищуєш лічильник.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((g) => (
            <GoalCard key={g.id} goal={g} projectId={projectId} />
          ))}
        </div>
      )}

      <NewGoalDialog
        trackerId={trackerId}
        projectId={projectId}
        open={newOpen}
        onOpenChange={setNewOpen}
      />
    </div>
  )
}

function GoalCard({ goal, projectId }: { goal: TrackerCustomDriver; projectId: string }) {
  const [, startTransition] = useTransition()
  const target = Number(goal.plan_value)
  const actual = Number(goal.actual_value)
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0
  const done = target > 0 && actual >= target

  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <Input
          defaultValue={goal.name}
          className="h-7 border-0 px-0 text-sm font-medium shadow-none focus-visible:ring-0"
          onBlur={(e) => {
            const v = e.target.value.trim()
            if (v && v !== goal.name) {
              startTransition(() => updateCustomGoal(goal.id, projectId, { name: v }))
            }
          }}
        />
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => {
            if (confirm(`Видалити ціль «${goal.name}»?`)) {
              startTransition(() => deleteCustomGoal(goal.id, projectId))
            }
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 flex items-baseline gap-1">
        <Input
          type="number"
          defaultValue={actual}
          className="h-7 w-16 px-1 text-right text-base font-semibold"
          onBlur={(e) => {
            const v = Number(e.target.value) || 0
            if (v !== actual) startTransition(() => updateCustomGoal(goal.id, projectId, { actual_value: v }))
          }}
        />
        <span className="text-sm text-muted-foreground">/</span>
        <Input
          type="number"
          defaultValue={target}
          className="h-7 w-16 px-1 text-right text-sm"
          onBlur={(e) => {
            const v = Number(e.target.value) || 0
            if (v !== target) startTransition(() => updateCustomGoal(goal.id, projectId, { plan_value: v }))
          }}
        />
        {goal.unit ? <span className="ml-1 text-xs text-muted-foreground">{goal.unit}</span> : null}
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded bg-muted">
        <div
          className={cn('h-full transition-all', done ? 'bg-emerald-500' : 'bg-foreground/70')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{pct}%</div>

      <div className="mt-2 flex gap-1">
        {[1, 2, 5].map((step) => (
          <Button
            key={step}
            size="sm"
            variant="outline"
            className="h-7 flex-1 px-2 text-xs"
            onClick={() => startTransition(() => incrementCustomGoal(goal.id, projectId, step))}
          >
            +{step}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => startTransition(() => incrementCustomGoal(goal.id, projectId, -1))}
        >
          −1
        </Button>
      </div>
    </div>
  )
}

function NewGoalDialog({
  trackerId,
  projectId,
  open,
  onOpenChange,
}: {
  trackerId: string
  projectId: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [, startTransition] = useTransition()
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [unit, setUnit] = useState('шт')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Нова ціль місяця</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Назва</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Провести кастдеви / Записати відео / …"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Ціль (число)</Label>
              <Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Од.</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="шт" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Відміна
          </Button>
          <Button
            disabled={!name.trim() || !target}
            onClick={() => {
              startTransition(async () => {
                await addCustomGoal(trackerId, projectId, name.trim(), Number(target) || 0, unit)
                setName('')
                setTarget('')
                setUnit('шт')
                onOpenChange(false)
              })
            }}
          >
            Створити
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
