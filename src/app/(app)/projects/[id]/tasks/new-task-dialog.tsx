'use client'

import { useActionState, useEffect, useRef } from 'react'

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
import type { Profile, TaskStatus } from '@/lib/supabase/types'

import { createTask, type TaskActionState } from './actions'

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs ' +
  'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'

export function NewTaskDialog({
  projectId,
  members,
  defaultStatus,
  open,
  onOpenChange,
}: {
  projectId: string
  members: Profile[]
  defaultStatus: TaskStatus
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [state, action, pending] = useActionState<TaskActionState, FormData>(createTask, undefined)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!pending && state === undefined && !state) {
      formRef.current?.reset()
    }
  }, [pending, state])

  // Close + reset on successful save (state is undefined after success)
  useEffect(() => {
    if (state === undefined && !pending && open) {
      // can't reliably detect "just saved" — let user close manually via X
    }
  }, [state, pending, open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Новая задача</DialogTitle>
        </DialogHeader>
        <form
          ref={formRef}
          action={(fd) => {
            action(fd)
            onOpenChange(false)
          }}
          className="space-y-3"
        >
          <input type="hidden" name="project_id" value={projectId} />
          <input type="hidden" name="status" value={defaultStatus} />
          <div className="space-y-2">
            <Label htmlFor="t-title">Название</Label>
            <Input id="t-title" name="title" autoFocus required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="t-assignee">Исполнитель</Label>
              <select id="t-assignee" name="assignee_id" defaultValue="" className={selectClass}>
                <option value="">— не назначен —</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name ?? m.email}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="t-due">Дедлайн</Label>
              <Input id="t-due" name="due_date" type="date" />
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
