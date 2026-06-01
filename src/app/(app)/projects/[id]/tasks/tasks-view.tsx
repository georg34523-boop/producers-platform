'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { CalendarClock, History, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

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
import { Textarea } from '@/components/ui/textarea'
import type {
  ProjectTask,
  ProjectTaskGroup,
  TaskDeadlineChange,
  TaskStatus,
  TrackerCustomDriver,
} from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

import {
  addTask,
  addTaskGroup,
  deleteTask,
  deleteTaskGroup,
  fetchDeadlineHistory,
  renameTaskGroup,
  updateTask,
  updateTaskDeadline,
} from './actions'

const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'Не почато',
  doing: 'В роботі',
  done: 'Зроблено',
}

const STATUS_ORDER: TaskStatus[] = ['todo', 'doing', 'done']

const STATUS_CLASS: Record<TaskStatus, string> = {
  todo: 'bg-muted text-muted-foreground border-muted-foreground/20 hover:bg-muted/80',
  doing: 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800',
  done: 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800',
}

function StatusSelect({
  status,
  onChange,
}: {
  status: TaskStatus
  onChange: (next: TaskStatus) => void
}) {
  return (
    <div
      className={cn(
        'relative inline-flex h-7 shrink-0 items-center rounded-full border pl-2.5 pr-6 text-[11px] font-medium transition-colors',
        STATUS_CLASS[status],
      )}
    >
      <span className="pointer-events-none">{STATUS_LABEL[status]}</span>
      <svg
        className="pointer-events-none absolute right-1.5 h-3 w-3 opacity-70"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <path d="M3 5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <select
        value={status}
        onChange={(e) => onChange(e.target.value as TaskStatus)}
        className="absolute inset-0 cursor-pointer appearance-none bg-transparent opacity-0"
        aria-label="Статус"
      >
        {STATUS_ORDER.map((s) => (
          <option key={s} value={s}>{STATUS_LABEL[s]}</option>
        ))}
      </select>
    </div>
  )
}

export function TasksView({
  projectId,
  groups,
  tasks,
  goals,
  deadlineChangeCounts,
}: {
  projectId: string
  groups: ProjectTaskGroup[]
  tasks: ProjectTask[]
  goals: TrackerCustomDriver[]
  deadlineChangeCounts: Record<string, number>
}) {
  const [, startTransition] = useTransition()
  const [newTaskOpen, setNewTaskOpen] = useState(false)
  const [newGroup, setNewGroup] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all')

  const filteredTasks = useMemo(
    () => (statusFilter === 'all' ? tasks : tasks.filter((t) => t.status === statusFilter)),
    [tasks, statusFilter],
  )

  const tasksByGroup = useMemo(() => {
    const m = new Map<string | 'none', ProjectTask[]>()
    for (const t of filteredTasks) {
      const k = t.group_id ?? 'none'
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(t)
    }
    return m
  }, [filteredTasks])

  const statusCounts = useMemo(() => {
    const c = { todo: 0, doing: 0, done: 0 } as Record<TaskStatus, number>
    for (const t of tasks) c[t.status]++
    return c
  }, [tasks])

  const ungrouped = tasksByGroup.get('none') ?? []

  const submitNewGroup = () => {
    const v = newGroup.trim()
    if (!v) return
    startTransition(async () => {
      await addTaskGroup(projectId, v)
      setNewGroup('')
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-heading text-lg font-medium">Задачі</h1>
          <p className="text-xs text-muted-foreground">
            Все що ОП веде по проєкту: продукт, воронки, трафік, комунікація. Можна привʼязувати до Доп цілі місяця.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={newGroup}
            onChange={(e) => setNewGroup(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNewGroup()
            }}
            placeholder="+ Нова група"
            className="h-8 w-40 text-xs"
          />
          <Button size="sm" onClick={() => setNewTaskOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Нова задача
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={cn(
            'rounded-full border px-3 py-1 text-xs transition-colors',
            statusFilter === 'all'
              ? 'border-foreground bg-muted'
              : 'text-muted-foreground hover:bg-muted/30',
          )}
        >
          Усі <span className="ml-1 text-[10px] text-muted-foreground">{tasks.length}</span>
        </button>
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              statusFilter === s
                ? STATUS_CLASS[s].split(' ').filter((c) => !c.startsWith('hover:')).join(' ')
                : 'text-muted-foreground hover:bg-muted/30',
            )}
          >
            {STATUS_LABEL[s]} <span className="ml-1 text-[10px] opacity-70">{statusCounts[s]}</span>
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {groups.map((g) => {
          const items = tasksByGroup.get(g.id) ?? []
          const isCollapsed = collapsed.has(g.id)
          return (
            <GroupSection
              key={g.id}
              group={g}
              tasks={items}
              groups={groups}
              goals={goals}
              projectId={projectId}
              deadlineChangeCounts={deadlineChangeCounts}
              collapsed={isCollapsed}
              onToggle={() =>
                setCollapsed((prev) => {
                  const next = new Set(prev)
                  if (next.has(g.id)) next.delete(g.id)
                  else next.add(g.id)
                  return next
                })
              }
            />
          )
        })}

        {ungrouped.length > 0 ? (
          <GroupSection
            key="none"
            group={null}
            tasks={ungrouped}
            groups={groups}
            goals={goals}
            projectId={projectId}
            deadlineChangeCounts={deadlineChangeCounts}
            collapsed={collapsed.has('none')}
            onToggle={() =>
              setCollapsed((prev) => {
                const next = new Set(prev)
                if (next.has('none')) next.delete('none')
                else next.add('none')
                return next
              })
            }
          />
        ) : null}
      </div>

      <NewTaskDialog
        projectId={projectId}
        groups={groups}
        goals={goals}
        open={newTaskOpen}
        onOpenChange={setNewTaskOpen}
      />
    </div>
  )
}

function GroupSection({
  group,
  tasks,
  groups,
  goals,
  projectId,
  collapsed,
  onToggle,
  deadlineChangeCounts,
}: {
  group: ProjectTaskGroup | null
  tasks: ProjectTask[]
  groups: ProjectTaskGroup[]
  goals: TrackerCustomDriver[]
  projectId: string
  collapsed: boolean
  onToggle: () => void
  deadlineChangeCounts: Record<string, number>
}) {
  const [, startTransition] = useTransition()
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(group?.name ?? '')

  return (
    <div className="rounded-md border bg-card/40">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <span className="text-xs text-muted-foreground">{collapsed ? '▶' : '▼'}</span>
          {group && editing ? (
            <Input
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                setEditing(false)
                if (name.trim() && name.trim() !== group.name) {
                  startTransition(() => renameTaskGroup(group.id, projectId, name.trim()))
                } else {
                  setName(group.name)
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                if (e.key === 'Escape') {
                  setEditing(false)
                  setName(group.name)
                }
              }}
              className="h-7 max-w-[200px] text-sm"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              className="text-sm font-medium"
              onDoubleClick={(e) => {
                if (group && !group.is_seed) {
                  e.stopPropagation()
                  setEditing(true)
                }
              }}
            >
              {group ? group.name : 'Без групи'}
            </span>
          )}
          <span className="text-xs text-muted-foreground">({tasks.length})</span>
        </button>
        {group && !group.is_seed ? (
          <button
            type="button"
            onClick={() => {
              if (confirm(`Видалити групу «${group.name}»? Задачі залишаться без групи.`)) {
                startTransition(() => deleteTaskGroup(group.id, projectId))
              }
            }}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      {!collapsed ? (
        <div className="divide-y">
          {tasks.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">Поки порожньо.</p>
          ) : (
            tasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                goals={goals}
                projectId={projectId}
                deadlineChangesCount={deadlineChangeCounts[t.id] ?? 0}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

function TaskRow({
  task,
  goals,
  projectId,
  deadlineChangesCount,
}: {
  task: ProjectTask
  goals: TrackerCustomDriver[]
  projectId: string
  deadlineChangesCount: number
}) {
  const [, startTransition] = useTransition()
  const [commentOpen, setCommentOpen] = useState(false)
  const [comment, setComment] = useState(task.comment ?? '')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const router = useRouter()

  const doDelete = () => {
    setConfirmOpen(false)
    startTransition(async () => {
      try {
        await deleteTask(task.id, projectId)
        router.refresh()
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Невідома помилка'
        toast.error(`Не вдалося видалити: ${message}`)
      }
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <Input
        defaultValue={task.title}
        onBlur={(e) => {
          const v = e.target.value.trim()
          if (v && v !== task.title) {
            startTransition(() => updateTask(task.id, projectId, { title: v }))
          }
        }}
        className={cn(
          'h-7 min-w-[160px] flex-1 border-transparent px-1 text-sm shadow-none focus-visible:border-input',
          task.status === 'done' && 'text-muted-foreground line-through',
        )}
      />

      <StatusSelect
        status={task.status}
        onChange={(next) =>
          startTransition(() => updateTask(task.id, projectId, { status: next }))
        }
      />

      <DeadlineCell
        taskId={task.id}
        taskTitle={task.title}
        deadline={task.deadline}
        projectId={projectId}
        changeCount={deadlineChangesCount}
      />

      {goals.length > 0 ? (
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">Ціль</span>
          <select
            value={task.linked_goal_id ?? ''}
            onChange={(e) =>
              startTransition(() =>
                updateTask(task.id, projectId, { linked_goal_id: e.target.value || null }),
              )
            }
            className="h-7 max-w-[160px] rounded-md border border-input bg-background px-1.5 text-xs"
            aria-label="Привʼязати до Доп цілі"
          >
            <option value="">— без цілі —</option>
            {goals.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
      ) : null}

      <Button
        size="xs"
        variant="ghost"
        onClick={() => setCommentOpen(true)}
        className="h-7 px-2 text-xs"
        title="Коментар"
      >
        {task.comment ? '💬' : '+'}
      </Button>

      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        title="Видалити"
        aria-label="Видалити задачу"
        onClick={() => setConfirmOpen(true)}
        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Видалити задачу?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">«{task.title}» — дію не можна відмінити.</p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>Відміна</Button>
            <Button variant="destructive" onClick={doDelete}>Видалити</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={commentOpen} onOpenChange={setCommentOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Коментар — {task.title}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={6}
            placeholder="Деталі, посилання, нотатки…"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCommentOpen(false)}>Відміна</Button>
            <Button
              onClick={() => {
                startTransition(async () => {
                  await updateTask(task.id, projectId, { comment: comment.trim() || null })
                  setCommentOpen(false)
                })
              }}
            >
              Зберегти
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DeadlineCell({
  taskId,
  taskTitle,
  deadline,
  projectId,
  changeCount,
}: {
  taskId: string
  taskTitle: string
  deadline: string | null
  projectId: string
  changeCount: number
}) {
  const [open, setOpen] = useState(false)

  const display = deadline
    ? new Date(deadline).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
    : '— нема —'

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted-foreground">Дедлайн</span>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'flex h-7 items-center gap-1 rounded-md border border-input bg-background px-2 text-xs hover:bg-muted/40',
          !deadline && 'text-muted-foreground',
        )}
      >
        <CalendarClock className="h-3 w-3" />
        {display}
        {changeCount > 0 ? (
          <span className="ml-0.5 rounded-full bg-amber-500/15 px-1 text-[9px] font-medium text-amber-700 dark:text-amber-400">
            ×{changeCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <DeadlineDialog
          taskId={taskId}
          taskTitle={taskTitle}
          deadline={deadline}
          projectId={projectId}
          changeCount={changeCount}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  )
}

function DeadlineDialog({
  taskId,
  taskTitle,
  deadline,
  projectId,
  changeCount,
  onClose,
}: {
  taskId: string
  taskTitle: string
  deadline: string | null
  projectId: string
  changeCount: number
  onClose: () => void
}) {
  const [, startTransition] = useTransition()
  const router = useRouter()
  const [newDate, setNewDate] = useState(deadline ?? '')
  const [reason, setReason] = useState('')
  const [history, setHistory] = useState<TaskDeadlineChange[] | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const isChange = deadline !== null && newDate && newDate !== deadline
  const reasonNeeded = isChange
  const canSubmit = newDate !== '' && newDate !== deadline && (!reasonNeeded || reason.trim().length > 0)

  useEffect(() => {
    if (!historyOpen || history) return
    let cancelled = false
    ;(async () => {
      const rows = await fetchDeadlineHistory(taskId)
      if (!cancelled) setHistory(rows)
    })()
    return () => {
      cancelled = true
    }
  }, [historyOpen, history, taskId])

  const submit = () => {
    startTransition(async () => {
      const res = await updateTaskDeadline(taskId, projectId, newDate || null, reason.trim() || undefined)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      router.refresh()
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Дедлайн — {taskTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {deadline ? (
            <div className="text-xs text-muted-foreground">
              Поточний:{' '}
              <span className="font-medium text-foreground">
                {new Date(deadline).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </span>
            </div>
          ) : null}

          <div className="space-y-1">
            <Label className="text-xs">Нова дата</Label>
            <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
          </div>

          {reasonNeeded ? (
            <div className="space-y-1">
              <Label className="text-xs">
                Причина переносу <span className="text-destructive">*</span>
              </Label>
              <Textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Напр.: експерт хворіє, перенесли зйомки, чекаємо матеріал…"
              />
              <p className="text-[11px] text-muted-foreground">
                Без причини змінити вже встановлений дедлайн не можна.
              </p>
            </div>
          ) : null}

          {changeCount > 0 ? (
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <History className="h-3 w-3" />
              {historyOpen ? 'Сховати історію' : `Історія перенесень (${changeCount})`}
            </button>
          ) : null}

          {historyOpen ? (
            history === null ? (
              <p className="text-xs text-muted-foreground">Завантажую…</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-muted-foreground">Поки порожньо.</p>
            ) : (
              <ul className="space-y-1 rounded-md border bg-muted/30 p-2 text-xs">
                {history.map((h) => (
                  <li key={h.id} className="space-y-0.5">
                    <div className="font-medium tabular-nums">
                      {h.old_deadline
                        ? new Date(h.old_deadline).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
                        : '—'}{' '}
                      → {' '}
                      {h.new_deadline
                        ? new Date(h.new_deadline).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
                        : '—'}
                      <span className="ml-2 text-[10px] text-muted-foreground">
                        {new Date(h.changed_at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                      </span>
                    </div>
                    <div className="text-muted-foreground">{h.reason}</div>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Відміна
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            Зберегти
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NewTaskDialog({
  projectId,
  groups,
  goals,
  open,
  onOpenChange,
}: {
  projectId: string
  groups: ProjectTaskGroup[]
  goals: TrackerCustomDriver[]
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const [, startTransition] = useTransition()
  const [title, setTitle] = useState('')
  const [groupId, setGroupId] = useState<string>(groups[0]?.id ?? '')
  const [deadline, setDeadline] = useState('')
  const [comment, setComment] = useState('')
  const [linkedGoalId, setLinkedGoalId] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Нова задача</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Назва</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Що потрібно зробити"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Група</Label>
              <select
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Без групи</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Дедлайн</Label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>
          {goals.length > 0 ? (
            <div className="space-y-1">
              <Label className="text-xs">Привʼязка до Доп цілі (опц.)</Label>
              <select
                value={linkedGoalId}
                onChange={(e) => setLinkedGoalId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">— не привʼязувати —</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label className="text-xs">Коментар (опц.)</Label>
            <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Відміна</Button>
          <Button
            disabled={!title.trim()}
            onClick={() => {
              startTransition(async () => {
                await addTask(projectId, {
                  title: title.trim(),
                  group_id: groupId || null,
                  status: 'todo',
                  deadline: deadline || null,
                  comment: comment.trim() || null,
                  linked_goal_id: linkedGoalId || null,
                })
                setTitle('')
                setDeadline('')
                setComment('')
                setLinkedGoalId('')
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
