'use server'

import { getTaskFull } from '@/lib/queries/tasks'

export async function loadTask(taskId: string) {
  return getTaskFull(taskId)
}
