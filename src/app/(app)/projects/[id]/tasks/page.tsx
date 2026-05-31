import { notFound } from 'next/navigation'

import { getProject } from '@/lib/queries/projects'
import {
  getCurrentMonthGoals,
  getTaskGroups,
  getTasks,
} from '@/lib/queries/tasks'

import { TasksView } from './tasks-view'

export default async function TasksPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const project = await getProject(id)
  if (!project) notFound()

  const [groups, tasks, goals] = await Promise.all([
    getTaskGroups(id),
    getTasks(id),
    getCurrentMonthGoals(id),
  ])

  return (
    <TasksView
      projectId={id}
      groups={groups}
      tasks={tasks}
      goals={goals}
    />
  )
}
