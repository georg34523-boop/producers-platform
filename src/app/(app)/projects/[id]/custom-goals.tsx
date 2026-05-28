'use client'

import { useState, useTransition } from 'react'
import { Check, Plus, Trash2 } from 'lucide-react'

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
        <div className="text-sm font-medium">Доп цілі</div>
        <Button size="sm" variant="outline" onClick={() => setNewOpen(true)}>
          <Plus className="mr-1 h-3.5 w-3.5" />
          Додати ціль
            </Button>
      </div>

      {goals.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Будь-яка ціль на місяць: «Провести апгрейд продукту», «Зібрати 20 кастдевів»,
          «Записати 10 відео». Може бути з лічильником або просто «зроблено».
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
  const isText = target === 0
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : goal.is_done ? 100 : 0
  const done = isText ? goal.is_done : target > 0 && actual >= target

  return (
    <div className={cn('rounded-md border p-3', done ? 'bg-emerald-50 dark:bg-emerald-950/30' : 'bg-background')}>
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

      {isText ? (
        // Текстова ціль: чек-бокс «зроблено»
        <button
          type="button"
          onClick={() => startTransition(() => updateCustomGoal(goal.id, projectId, { is_done: !goal.is_done }))}
          className={cn(
            'mt-3 flex w-full items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
            done
              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : 'border-input hover:bg-muted',
          )}
        >
          <Check className={cn('h-4 w-4', done ? 'opacity-100' : 'opacity-30')} />
          {done ? 'Зроблено' : 'Позначити «зроблено»'}
        </button>
      ) : (
        // Числова ціль
        <>
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
        </>
      )}
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
  const [mode, setMode] = useState<'text' | 'number'>('text')
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
              placeholder='Наприклад: «Провести апгрейд продукту»'
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Тип</Label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setMode('text')}
                className={cn(
                  'flex-1 rounded-md border px-3 py-2 text-sm transition-colors',
                  mode === 'text' ? 'border-foreground bg-muted' : 'text-muted-foreground hover:bg-muted/30',
                )}
              >
                Зроблено / ні
              </button>
              <button
                type="button"
                onClick={() => setMode('number')}
                className={cn(
                  'flex-1 rounded-md border px-3 py-2 text-sm transition-colors',
                  mode === 'number' ? 'border-foreground bg-muted' : 'text-muted-foreground hover:bg-muted/30',
                )}
              >
                Лічильник
              </button>
            </div>
          </div>

          {mode === 'number' ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Ціль</Label>
                <Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="20" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Од.</Label>
                <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="шт / відео / …" />
              </div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Відміна</Button>
          <Button
            disabled={!name.trim() || (mode === 'number' && !target)}
            onClick={() => {
              startTransition(async () => {
                const goal = mode === 'number' ? Number(target) || 0 : 0
                const u = mode === 'number' ? unit : ''
                await addCustomGoal(trackerId, projectId, name.trim(), goal, u)
                setName('')
                setTarget('')
                setUnit('шт')
                setMode('text')
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
