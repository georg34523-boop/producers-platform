import { listFunnels } from '@/lib/queries/funnels'

import { FunnelsView } from './funnels-view'

export default async function ProjectFunnelsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const funnels = await listFunnels(id)
  return <FunnelsView projectId={id} funnels={funnels} />
}
