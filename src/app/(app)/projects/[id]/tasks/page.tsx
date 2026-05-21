import { listProfiles } from '@/lib/queries/profiles'
import { listTasks } from '@/lib/queries/tasks'

import { Kanban } from './kanban'

export default async function ProjectTasksPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [tasks, members] = await Promise.all([
    listTasks(id),
    listProfiles({ roles: ['team_lead', 'producer'] }),
  ])

  return <Kanban projectId={id} tasks={tasks} members={members} />
}
