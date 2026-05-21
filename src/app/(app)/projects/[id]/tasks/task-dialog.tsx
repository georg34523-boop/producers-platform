'use client'

import { useEffect, useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TASK_STATUS_LABEL } from '@/lib/labels'
import type { Profile, TaskStatus } from '@/lib/supabase/types'

import {
  addChecklistItem,
  addComment,
  deleteChecklistItem,
  deleteTask,
  toggleChecklistItem,
  updateTask,
} from './actions'
import { loadTask } from './load-task'

type FullTask = Awaited<ReturnType<typeof loadTask>>

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs ' +
  'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none'

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done']

export function TaskDialog({
  taskId,
  projectId,
  members,
  open,
  onOpenChange,
}: {
  taskId: string
  projectId: string
  members: Profile[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [task, setTask] = useState<FullTask>(null)
  const [, startTransition] = useTransition()

  async function refresh() {
    const t = await loadTask(taskId)
    setTask(t)
  }

  useEffect(() => {
    if (open) void refresh()
  }, [open, taskId])

  const submitField = (field: string) => (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const fd = new FormData()
    fd.set('id', taskId)
    fd.set('project_id', projectId)
    fd.set(field, e.target.value)
    startTransition(async () => {
      await updateTask(fd)
      void refresh()
    })
  }

  const submitSelect = (field: string) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    const fd = new FormData()
    fd.set('id', taskId)
    fd.set('project_id', projectId)
    fd.set(field, e.target.value)
    startTransition(async () => {
      await updateTask(fd)
      void refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {task ? (
          <>
            <DialogHeader>
              <DialogTitle>
                <Input
                  defaultValue={task.title}
                  onBlur={submitField('title')}
                  className="h-auto border-0 px-0 text-base font-semibold shadow-none focus-visible:ring-0"
                />
              </DialogTitle>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Статус</Label>
                <select
                  defaultValue={task.status}
                  onChange={submitSelect('status')}
                  className={selectClass}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {TASK_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Приоритет</Label>
                <select
                  defaultValue={task.priority}
                  onChange={submitSelect('priority')}
                  className={selectClass}
                >
                  <option value="low">Низкий</option>
                  <option value="normal">Обычный</option>
                  <option value="high">Высокий</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Исполнитель</Label>
                <select
                  defaultValue={task.assignee_id ?? ''}
                  onChange={submitSelect('assignee_id')}
                  className={selectClass}
                >
                  <option value="">— не назначен —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name ?? m.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Дедлайн</Label>
                <Input
                  type="date"
                  defaultValue={task.due_date ?? ''}
                  onBlur={submitField('due_date')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Описание</Label>
              <Textarea
                rows={4}
                defaultValue={task.description ?? ''}
                onBlur={submitField('description')}
                placeholder="Контекст, детали, ссылки…"
              />
            </div>

            <div className="space-y-2">
              <Label>Чек-лист</Label>
              <div className="space-y-1">
                {task.checklist.map((c) => (
                  <ChecklistItem
                    key={c.id}
                    id={c.id}
                    title={c.title}
                    done={c.done}
                    projectId={projectId}
                    onChanged={() => void refresh()}
                  />
                ))}
              </div>
              <ChecklistAdd taskId={taskId} projectId={projectId} onAdded={() => void refresh()} />
            </div>

            <div className="space-y-2">
              <Label>Комментарии</Label>
              <div className="space-y-2">
                {task.comments.map((c) => (
                  <div key={c.id} className="rounded-md border bg-card/40 p-2 text-sm">
                    <div className="text-xs text-muted-foreground">
                      {c.author.full_name ?? c.author.email} ·{' '}
                      {new Date(c.created_at).toLocaleString('ru-RU')}
                    </div>
                    <div className="mt-1 whitespace-pre-wrap">{c.body}</div>
                  </div>
                ))}
                {task.comments.length === 0 ? (
                  <div className="text-xs text-muted-foreground">Пока нет комментариев</div>
                ) : null}
              </div>
              <CommentAdd taskId={taskId} projectId={projectId} onAdded={() => void refresh()} />
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (!confirm('Удалить задачу?')) return
                  startTransition(async () => {
                    await deleteTask(taskId, projectId)
                    onOpenChange(false)
                  })
                }}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Удалить
              </Button>
            </div>
          </>
        ) : (
          <div className="py-12 text-center text-sm text-muted-foreground">Загрузка…</div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ChecklistItem({
  id,
  title,
  done,
  projectId,
  onChanged,
}: {
  id: string
  title: string
  done: boolean
  projectId: string
  onChanged: () => void
}) {
  const [, startTransition] = useTransition()
  return (
    <div className="flex items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-muted/30">
      <input
        type="checkbox"
        defaultChecked={done}
        onChange={(e) =>
          startTransition(async () => {
            await toggleChecklistItem(id, e.target.checked, projectId)
            onChanged()
          })
        }
        className="h-4 w-4 cursor-pointer"
      />
      <span className={done ? 'flex-1 text-muted-foreground line-through' : 'flex-1'}>{title}</span>
      <button
        type="button"
        className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
        onClick={() =>
          startTransition(async () => {
            await deleteChecklistItem(id, projectId)
            onChanged()
          })
        }
        aria-label="Удалить пункт"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

function ChecklistAdd({
  taskId,
  projectId,
  onAdded,
}: {
  taskId: string
  projectId: string
  onAdded: () => void
}) {
  const [value, setValue] = useState('')
  const [, startTransition] = useTransition()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!value.trim()) return
        const fd = new FormData()
        fd.set('task_id', taskId)
        fd.set('project_id', projectId)
        fd.set('title', value.trim())
        startTransition(async () => {
          await addChecklistItem(fd)
          setValue('')
          onAdded()
        })
      }}
      className="flex gap-2"
    >
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Добавить пункт"
        className="h-8 text-sm"
      />
      <Button type="submit" size="sm" variant="outline" disabled={!value.trim()}>
        Добавить
      </Button>
    </form>
  )
}

function CommentAdd({
  taskId,
  projectId,
  onAdded,
}: {
  taskId: string
  projectId: string
  onAdded: () => void
}) {
  const [value, setValue] = useState('')
  const [, startTransition] = useTransition()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (!value.trim()) return
        const fd = new FormData()
        fd.set('task_id', taskId)
        fd.set('project_id', projectId)
        fd.set('body', value.trim())
        startTransition(async () => {
          await addComment(fd)
          setValue('')
          onAdded()
        })
      }}
      className="space-y-2"
    >
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="Написать комментарий…"
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!value.trim()}>
          Отправить
        </Button>
      </div>
    </form>
  )
}
