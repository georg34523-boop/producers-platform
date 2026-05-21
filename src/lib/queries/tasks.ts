import 'server-only'

import { createClient } from '@/lib/supabase/server'
import type { Comment, Profile, Task, TaskChecklistItem } from '@/lib/supabase/types'

export type TaskRow = Task & {
  assignee: Pick<Profile, 'id' | 'full_name' | 'email'> | null
  checklist: { total: number; done: number }
  comments_count: number
}

export async function listTasks(projectId: string): Promise<TaskRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('tasks')
    .select(
      `*,
       assignee:profiles!tasks_assignee_id_fkey(id, full_name, email),
       checklist:task_checklist_items(id, done),
       comments_count:comments(count)`,
    )
    .eq('project_id', projectId)
    .is('parent_task_id', null)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  type Raw = Omit<TaskRow, 'checklist' | 'comments_count'> & {
    checklist: { id: string; done: boolean }[]
    comments_count: { count: number }[]
  }
  return ((data ?? []) as Raw[]).map((t) => ({
    ...t,
    checklist: {
      total: t.checklist.length,
      done: t.checklist.filter((c) => c.done).length,
    },
    comments_count: t.comments_count?.[0]?.count ?? 0,
  }))
}

export async function getTaskFull(taskId: string): Promise<
  | (Task & {
      assignee: Pick<Profile, 'id' | 'full_name' | 'email'> | null
      checklist: TaskChecklistItem[]
      comments: (Comment & { author: Pick<Profile, 'id' | 'full_name' | 'email'> })[]
      subtasks: (Task & { assignee: Pick<Profile, 'id' | 'full_name' | 'email'> | null })[]
    })
  | null
> {
  const supabase = await createClient()
  const [{ data: task, error: tErr }, { data: checklist }, { data: comments }, { data: subtasks }] =
    await Promise.all([
      supabase
        .from('tasks')
        .select(`*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email)`)
        .eq('id', taskId)
        .maybeSingle(),
      supabase
        .from('task_checklist_items')
        .select('*')
        .eq('task_id', taskId)
        .order('position'),
      supabase
        .from('comments')
        .select(`*, author:profiles!comments_author_id_fkey(id, full_name, email)`)
        .eq('entity_type', 'task')
        .eq('entity_id', taskId)
        .order('created_at', { ascending: true }),
      supabase
        .from('tasks')
        .select(`*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email)`)
        .eq('parent_task_id', taskId)
        .order('position'),
    ])

  if (tErr || !task) return null
  return {
    ...(task as Task & {
      assignee: Pick<Profile, 'id' | 'full_name' | 'email'> | null
    }),
    checklist: (checklist ?? []) as TaskChecklistItem[],
    comments: (comments ?? []) as (Comment & {
      author: Pick<Profile, 'id' | 'full_name' | 'email'>
    })[],
    subtasks: (subtasks ?? []) as (Task & {
      assignee: Pick<Profile, 'id' | 'full_name' | 'email'> | null
    })[],
  }
}
