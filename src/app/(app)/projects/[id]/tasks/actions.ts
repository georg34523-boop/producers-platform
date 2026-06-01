'use server'

import { revalidatePath } from 'next/cache'

import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { TaskDeadlineChange, TaskStatus } from '@/lib/supabase/types'

const revalidate = (projectId: string) => {
  revalidatePath(`/projects/${projectId}/tasks`)
  revalidatePath(`/projects/${projectId}`)
  revalidatePath('/')
}

// ============================================================
// Groups
// ============================================================
export async function addTaskGroup(projectId: string, name: string): Promise<void> {
  await requireProfile()
  const trimmed = name.trim()
  if (!trimmed) return
  const supabase = await createClient()
  const { data: last } = await supabase
    .from('project_task_groups')
    .select('position')
    .eq('project_id', projectId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  await supabase.from('project_task_groups').insert({
    project_id: projectId,
    name: trimmed,
    is_seed: false,
    position: (last?.position ?? -1) + 1,
  })
  revalidate(projectId)
}

export async function renameTaskGroup(
  groupId: string,
  projectId: string,
  name: string,
): Promise<void> {
  await requireProfile()
  const trimmed = name.trim()
  if (!trimmed) return
  const supabase = await createClient()
  await supabase.from('project_task_groups').update({ name: trimmed }).eq('id', groupId)
  revalidate(projectId)
}

export async function deleteTaskGroup(groupId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  // Заборона видаляти пресетні групи
  const { data: g } = await supabase
    .from('project_task_groups')
    .select('is_seed')
    .eq('id', groupId)
    .maybeSingle()
  if (g?.is_seed) return
  await supabase.from('project_task_groups').delete().eq('id', groupId)
  revalidate(projectId)
}

// ============================================================
// Tasks
// ============================================================
export async function addTask(
  projectId: string,
  input: {
    title: string
    group_id: string | null
    status?: TaskStatus
    deadline?: string | null
    comment?: string | null
    linked_goal_id?: string | null
  },
): Promise<void> {
  const me = await requireProfile()
  const title = input.title.trim()
  if (!title) return
  const supabase = await createClient()
  const { data: last } = await supabase
    .from('project_tasks')
    .select('position')
    .eq('project_id', projectId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()
  await supabase.from('project_tasks').insert({
    project_id: projectId,
    group_id: input.group_id,
    title,
    status: input.status ?? 'todo',
    deadline: input.deadline || null,
    comment: input.comment || null,
    linked_goal_id: input.linked_goal_id || null,
    position: (last?.position ?? -1) + 1,
    created_by: me.id,
  })
  revalidate(projectId)
}

export async function updateTask(
  taskId: string,
  projectId: string,
  patch: Partial<{
    title: string
    group_id: string | null
    status: TaskStatus
    comment: string | null
    linked_goal_id: string | null
  }>,
): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('project_tasks').update(patch).eq('id', taskId)
  revalidate(projectId)
}

/**
 * Окрема дія для зміни дедлайну. Якщо стара дата вже була і нова відрізняється —
 * причина обовʼязкова і запис йде в історію `project_task_deadline_changes`.
 * Перший раз дедлайн — без причини.
 */
export async function updateTaskDeadline(
  taskId: string,
  projectId: string,
  newDeadline: string | null,
  reason?: string,
): Promise<{ error?: string } | undefined> {
  const me = await requireProfile()
  const supabase = await createClient()
  const { data: cur } = await supabase
    .from('project_tasks')
    .select('deadline')
    .eq('id', taskId)
    .maybeSingle()
  const oldDeadline = (cur?.deadline as string | null) ?? null
  const newValue = newDeadline || null

  if (oldDeadline === newValue) return

  if (oldDeadline !== null && newValue !== oldDeadline) {
    const trimmedReason = (reason ?? '').trim()
    if (!trimmedReason) return { error: 'Введи причину переносу дедлайну' }
    await supabase.from('project_task_deadline_changes').insert({
      task_id: taskId,
      project_id: projectId,
      old_deadline: oldDeadline,
      new_deadline: newValue,
      reason: trimmedReason,
      changed_by: me.id,
    })
  }

  await supabase.from('project_tasks').update({ deadline: newValue }).eq('id', taskId)
  revalidate(projectId)
}

export async function deleteTask(taskId: string, projectId: string): Promise<void> {
  await requireProfile()
  const supabase = await createClient()
  await supabase.from('project_tasks').delete().eq('id', taskId)
  revalidate(projectId)
}

/** Завантажити історію переносів дедлайну для попапу задачі. */
export async function fetchDeadlineHistory(taskId: string): Promise<TaskDeadlineChange[]> {
  await requireProfile()
  const supabase = await createClient()
  const { data } = await supabase
    .from('project_task_deadline_changes')
    .select('*')
    .eq('task_id', taskId)
    .order('changed_at', { ascending: false })
  return (data ?? []) as TaskDeadlineChange[]
}
