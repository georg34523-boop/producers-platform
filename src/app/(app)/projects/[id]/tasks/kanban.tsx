'use client'

import { useState, useTransition } from 'react'
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { CalendarDays, CheckSquare, MessageSquare, Plus, User2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TASK_STATUS_LABEL } from '@/lib/labels'
import type { Profile, TaskStatus } from '@/lib/supabase/types'
import { cn } from '@/lib/utils'

import type { TaskRow } from '@/lib/queries/tasks'
import { updateTaskStatus } from './actions'
import { NewTaskDialog } from './new-task-dialog'
import { TaskDialog } from './task-dialog'

const COLUMNS: TaskStatus[] = ['todo', 'in_progress', 'blocked', 'done']

export function Kanban({
  projectId,
  tasks,
  members,
}: {
  projectId: string
  tasks: TaskRow[]
  members: Profile[]
}) {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [newOpenStatus, setNewOpenStatus] = useState<TaskStatus | null>(null)
  const [, startTransition] = useTransition()

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  )

  function onDragEnd(e: DragEndEvent) {
    const taskId = String(e.active.id)
    const target = e.over?.id as TaskStatus | undefined
    if (!target) return
    const task = tasks.find((t) => t.id === taskId)
    if (!task || task.status === target) return
    startTransition(() => {
      void updateTaskStatus(taskId, projectId, target)
    })
  }

  const grouped = COLUMNS.reduce<Record<TaskStatus, TaskRow[]>>(
    (acc, c) => ({ ...acc, [c]: tasks.filter((t) => t.status === c) }),
    { todo: [], in_progress: [], blocked: [], done: [] },
  )

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((status) => (
            <Column
              key={status}
              status={status}
              tasks={grouped[status]}
              onAdd={() => setNewOpenStatus(status)}
              onOpenTask={(id) => setOpenTaskId(id)}
            />
          ))}
        </div>
      </DndContext>

      <NewTaskDialog
        projectId={projectId}
        members={members}
        defaultStatus={newOpenStatus ?? 'todo'}
        open={newOpenStatus !== null}
        onOpenChange={(o) => !o && setNewOpenStatus(null)}
      />

      {openTaskId ? (
        <TaskDialog
          taskId={openTaskId}
          projectId={projectId}
          members={members}
          open
          onOpenChange={(o) => !o && setOpenTaskId(null)}
        />
      ) : null}
    </>
  )
}

function Column({
  status,
  tasks,
  onAdd,
  onOpenTask,
}: {
  status: TaskStatus
  tasks: TaskRow[]
  onAdd: () => void
  onOpenTask: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col gap-2 rounded-lg border bg-card/40 p-3 transition-colors',
        isOver && 'border-foreground/30 bg-muted/40',
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{TASK_STATUS_LABEL[status]}</span>
          <Badge variant="secondary" className="rounded-full px-2 text-xs">
            {tasks.length}
          </Badge>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onAdd} aria-label="Добавить задачу">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex min-h-24 flex-col gap-2">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} onClick={() => onOpenTask(t.id)} />
        ))}
      </div>
    </div>
  )
}

function TaskCard({ task, onClick }: { task: TaskRow; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined
  const assignee = task.assignee?.full_name ?? task.assignee?.email
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={cn(
        'cursor-grab rounded-md border bg-card p-3 shadow-xs transition-shadow hover:shadow-sm',
        isDragging && 'opacity-50',
      )}
    >
      <div className="text-sm font-medium">{task.title}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {assignee ? (
          <span className="inline-flex items-center gap-1">
            <User2 className="h-3 w-3" />
            {assignee}
          </span>
        ) : null}
        {task.due_date ? (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3" />
            {new Date(task.due_date).toLocaleDateString('ru-RU')}
          </span>
        ) : null}
        {task.checklist.total > 0 ? (
          <span className="inline-flex items-center gap-1">
            <CheckSquare className="h-3 w-3" />
            {task.checklist.done}/{task.checklist.total}
          </span>
        ) : null}
        {task.comments_count > 0 ? (
          <span className="inline-flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {task.comments_count}
          </span>
        ) : null}
      </div>
    </div>
  )
}
