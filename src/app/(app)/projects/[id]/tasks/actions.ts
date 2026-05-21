'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { TaskStatus } from '@/lib/supabase/types'

const TaskStatusZ = z.enum(['todo', 'in_progress', 'blocked', 'done'])

const CreateTaskSchema = z.object({
  project_id: z.uuid(),
  title: z.string().min(1, { error: 'Введи название' }).max(200).trim(),
  status: TaskStatusZ.default('todo'),
  assignee_id: z.union([z.uuid(), z.literal('')]).transform((v) => (v === '' ? null : v)),
  due_date: z.union([z.iso.date(), z.literal('')]).transform((v) => (v === '' ? null : v)),
  parent_task_id: z.uuid().optional(),
})

export type TaskActionState = { error?: string } | undefined

export async function createTask(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const me = await requireProfile()
  const parsed = CreateTaskSchema.safeParse({
    project_id: formData.get('project_id'),
    title: formData.get('title'),
    status: formData.get('status') ?? 'todo',
    assignee_id: formData.get('assignee_id') ?? '',
    due_date: formData.get('due_date') ?? '',
    parent_task_id: formData.get('parent_task_id') || undefined,
  })
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { error: first?.message ?? 'Ошибка валидации' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('tasks').insert({
    project_id: parsed.data.project_id,
    title: parsed.data.title,
    status: parsed.data.status,
    assignee_id: parsed.data.assignee_id,
    due_date: parsed.data.due_date,
    parent_task_id: parsed.data.parent_task_id ?? null,
    created_by: me.id,
  })
  if (error) return { error: error.message }

  revalidatePath(`/projects/${parsed.data.project_id}/tasks`)
  return undefined
}

export async function updateTaskStatus(
  taskId: string,
  projectId: string,
  status: TaskStatus,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase
    .from('tasks')
    .update({
      status,
      completed_at: status === 'done' ? new Date().toISOString() : null,
    })
    .eq('id', taskId)
  revalidatePath(`/projects/${projectId}/tasks`)
}

const UpdateTaskSchema = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  title: z.string().min(1).max(200).trim().optional(),
  description: z.string().max(5000).optional(),
  status: TaskStatusZ.optional(),
  priority: z.enum(['low', 'normal', 'high']).optional(),
  assignee_id: z.union([z.uuid(), z.literal('')]).optional(),
  due_date: z.union([z.iso.date(), z.literal('')]).optional(),
})

export async function updateTask(formData: FormData): Promise<TaskActionState> {
  await requireProfile()
  const raw: Record<string, unknown> = {
    id: formData.get('id'),
    project_id: formData.get('project_id'),
  }
  for (const k of ['title', 'description', 'status', 'priority', 'assignee_id', 'due_date']) {
    const v = formData.get(k)
    if (v !== null) raw[k] = v
  }
  const parsed = UpdateTaskSchema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { error: first?.message ?? 'Ошибка валидации' }
  }

  const { id, project_id, ...patch } = parsed.data
  const normalized: Record<string, unknown> = { ...patch }
  if (normalized.assignee_id === '') normalized.assignee_id = null
  if (normalized.due_date === '') normalized.due_date = null

  const supabase = await createClient()
  const { error } = await supabase.from('tasks').update(normalized).eq('id', id)
  if (error) return { error: error.message }

  revalidatePath(`/projects/${project_id}/tasks`)
  return undefined
}

export async function deleteTask(taskId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('tasks').delete().eq('id', taskId)
  revalidatePath(`/projects/${projectId}/tasks`)
}

const ChecklistItemSchema = z.object({
  task_id: z.uuid(),
  project_id: z.uuid(),
  title: z.string().min(1).max(200).trim(),
})

export async function addChecklistItem(formData: FormData): Promise<TaskActionState> {
  await requireProfile()
  const parsed = ChecklistItemSchema.safeParse({
    task_id: formData.get('task_id'),
    project_id: formData.get('project_id'),
    title: formData.get('title'),
  })
  if (!parsed.success) return { error: 'Ошибка валидации' }
  const supabase = await createClient()
  await supabase.from('task_checklist_items').insert({
    task_id: parsed.data.task_id,
    title: parsed.data.title,
  })
  revalidatePath(`/projects/${parsed.data.project_id}/tasks`)
  return undefined
}

export async function toggleChecklistItem(
  itemId: string,
  done: boolean,
  projectId: string,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('task_checklist_items').update({ done }).eq('id', itemId)
  revalidatePath(`/projects/${projectId}/tasks`)
}

export async function deleteChecklistItem(itemId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('task_checklist_items').delete().eq('id', itemId)
  revalidatePath(`/projects/${projectId}/tasks`)
}

const CommentSchema = z.object({
  task_id: z.uuid(),
  project_id: z.uuid(),
  body: z.string().min(1).max(5000).trim(),
})

export async function addComment(formData: FormData): Promise<TaskActionState> {
  const me = await requireProfile()
  const parsed = CommentSchema.safeParse({
    task_id: formData.get('task_id'),
    project_id: formData.get('project_id'),
    body: formData.get('body'),
  })
  if (!parsed.success) return { error: 'Введи текст комментария' }
  const supabase = await createClient()
  const { error } = await supabase.from('comments').insert({
    entity_type: 'task',
    entity_id: parsed.data.task_id,
    author_id: me.id,
    body: parsed.data.body,
  })
  if (error) return { error: error.message }
  revalidatePath(`/projects/${parsed.data.project_id}/tasks`)
  return undefined
}
