import { listGoals } from '@/lib/queries/goals'
import { GoalsView } from './goals-view'

export default async function ProjectGoalsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const goals = await listGoals(id)
  return <GoalsView projectId={id} goals={goals} />
}
